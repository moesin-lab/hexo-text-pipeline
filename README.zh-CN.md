[English](README.md) | **简体中文**

# hexo-text-pipeline

Hexo 渲染管线的通用 hooks 总线。

Hexo 渲染过程中所有"文本进、文本出"的执行点都被暴露为 stage。你用纯声明式配置往 stage 上挂东西——自己的脚本、shell 命令、或打包好的 preset。checker 系统全程兜底：配置错误在第一篇文章被处理之前就被发现，单个节点失败只会被跳过，构建永远不炸。

设计目标：绝大多数小型 Hexo 插件做的事，本质都是"在管线的某个点变换一段文本"。这不该需要发包、不该需要配置——**写插件就是写一个文件**。在站点根目录建 `text-pipeline/`，丢进去：

```js
// text-pipeline/arrow.js —— 这就是一个完整插件
module.exports = {
  replace: [[/-->/g, '→']]
};
```

下一次 `hexo generate` 它就在跑了：零配置自动发现，markdown 阶段自动跳过代码块，逻辑改动即改即用，坏了只会被跳过、构建永远不炸。完整契约见 [docs/PLUGINS.zh-CN.md](docs/PLUGINS.zh-CN.md)。

## Stage 表

| Stage | 流经的文本 |
|-------|-----------|
| `before_post_render` | 单篇文章的 **markdown**（渲染前） |
| `after_post_render` | 单篇文章的 **HTML 片段**（渲染后） |
| `after_render:html` | 模板套完后的**完整页面 HTML** |
| `after_render:css` / `after_render:js` | 生成的静态资源 |

与 [Hexo filter API](https://hexo.io/api/filter) 一一对应。非文本的 filter（`template_locals`、`server_middleware` 等）刻意不在范围内。

## 四种挂载方式

**1. 单文件插件（默认答案）** —— `text-pipeline/` 目录里每个 `.js` 文件自动挂载。导出与统一契约同形的 node 对象（`name` 缺省取文件名），`replace` 规则表是 `convert` 的声明式写法；`_config.yml` 可按插件名覆盖 `enable` / `slot` / `priority`，其余子配置进 `ctx.config`。详见 [docs/PLUGINS.zh-CN.md](docs/PLUGINS.zh-CN.md)。

```js
// text-pipeline/ruby.js
module.exports = {
  stage: 'before_post_render',
  match: '\\{ruby',
  convert: (text, ctx) => text.replace(/\{ruby (.+?)\}/g, '<ruby>$1</ruby>')
};
```

**2. 本地脚本（hook）** —— `module.exports = (text, ctx) => text`，相对 Hexo 根目录解析，每次执行重新加载。改完文件，下一次渲染就生效。想要纯函数形态、placement 写在 YAML 里时用它。

```yaml
hooks:
  - script: scripts/minify.js
    stage: after_render:html
```

**3. 外部命令** —— 正文从 stdin 进，变换结果从 stdout 出，任何语言。上下文走环境变量：`HTP_STAGE` / `HTP_SLOT` 恒有，post 类 stage 给 `HTP_POST_SOURCE` / `HTP_POST_PATH` / `HTP_POST_TITLE`，string 类给 `HTP_FILE_PATH`。

```yaml
hooks:
  - command: python scripts/furigana.py
    stage: before_post_render   # 默认 stage
    name: furigana              # 可选，日志标识
    priority: 20                # 可选，默认 10，小者先跑
    timeout: 10000              # 可选，毫秒
    match: '\\{furigana'        # 可选正则：文本不命中直接跳过（command 可省一次 spawn）
    slot: late                  # 可选：late（默认，看到该 stage 最终文本）| early（原始文本）
```

**4. 程序化注册** —— 其他插件（或站点 `scripts/` 目录里的脚本）可以直接注册 node：

```js
hexo.textPipeline.register({
  name: 'exclaim',
  stage: 'before_post_render',
  priority: 5,
  convert: (text, ctx) => text + '!'
});
```

注册的默认值与校验和 hooks 同一套规则（slot 默认 `late`，也支持 `match` 正则预判）。`ctx` 为 `{ hexo, stage, pluginConfig, utils, log }`，post 类 stage 另有 `ctx.post`、string 类有 `ctx.file`；`ctx.utils` 自带 `replaceOutsideCode` / `segmentInlineCode`，在 markdown 阶段做行内替换时安全跳过代码块。

### 执行顺序：每个 stage 两个挂点

每个 stage 有两个挂点，注册在 Hexo 自己的 filter 前后：

```
[5]   early 挂点 —— preset node 默认在这里（它们需要原始文本，
      比如 mermaid 必须在高亮器吃掉围栏代码块之前看到它）
[10]  hexo 内置 filter（代码高亮等）和其他插件
[100] late 挂点 —— 你的 hook 默认在这里（看到该 stage 的最终文本）
```

hook 加 `slot: early` 可以抢到所有人之前；preset node 加 `slot: late` 可以压到最后。同一挂点内按 `priority` 升序（默认 10），同级按声明顺序。`hexo pipeline` 会打印最终解析出的精确顺序，永远不用猜。

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
.text-pipeline-tap/_posts_my-post.md/after_post_render.late/
├── 00-input.txt              ← 挂在该 stage（late 挂点）的 hook 收到的就是这个
├── 01-hook_my-hook.txt       ← 每个改动了文本的 node 改完后的样子
└── …                         ← 最后一个文件即该挂点的最终输出
```

每个 stage 的每个挂点一个快照目录（`<stage>.early` / `<stage>.late`）。

每轮渲染替换上一轮快照。tap 目录记得加进 `.gitignore`，正常构建时关掉 `enable`。

## 内置 preset：`obsidian`

把 Obsidian Flavored Markdown 编译为 Hexo 友好输出。`presets: [obsidian]` 启用。

| Node | 语法 | 默认 | 行为 |
|------|------|------|------|
| `comment` | `%%行内%%`、跨行 `%% … %%` | 开 | 渲染前剥离（代码内为字面量） |
| `embed` | `![[图片.png\|300]]`、`![[笔记]]` | 开 | 图片 → markdown 图片 / `<img width>`（`asset_prefix` 配置）；可解析的笔记嵌入 → 链接；其他原样保留 |
| `wikilink` | `[[目标#锚点\|别名]]`、`[[#标题]]` | 开 | 重写为文章永久链接（`abbrlink` 优先，回退 `post.path`）；同页标题 → `#锚点`；块引用锚点（`#^id`）降级为文章链接 |
| `highlight` | `==文本==` | 开 | `<mark>文本</mark>` |
| `blockid` | 行尾 `^block-id` | 开 | 剥离（Obsidian 阅读视图里同样不可见） |
| `mdlink` | HTML 里残留的 `.md` 链接 | 开 | 兜底重写为文章永久链接 |
| `mermaid` | ` ```mermaid ` 围栏块 | 开 | 换成 `<pre class="mermaid">` 绕开语法高亮；按需注入懒加载 CDN 脚本 |
| `callout` | `> [!type] 标题` | **关** | `<div class="callout callout-type">`；主流渲染器/主题已多自带支持，所以默认关 |

```yaml
presets:
  - name: obsidian
    config:
      domain_prefix: ''                  # wikilink/mdlink/embed 的链接前缀
      callout: { enable: true }          # 按需打开
      embed: { asset_prefix: /images }   # 嵌入图片路径的前缀
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
  hooks: []          # { script | command, stage, slot, priority, name, timeout, match, enable }
  plugins_dir: text-pipeline   # 单文件插件目录；false 关闭自动发现
  plugins: {}        # 按插件名覆盖：{ <name>: { enable, slot, priority, ...其余进 ctx.config } }
  tap:               # 调试模式：落盘每个 stage 的文本快照（见"开发 hook"）
    enable: false
    match: ''
    dir: .text-pipeline-tap
```

## 开发

唯一运行时依赖是 `hexo-util`（Hexo 本体自带，npm 会直接复用站点已有的那份，零额外安装成本）。Node >= 16。

```bash
npm test   # node --test
```

- **单文件插件（写插件从这里开始）**：[docs/PLUGINS.zh-CN.md](docs/PLUGINS.zh-CN.md)
- Hooks 接口文档（stage 输入、ctx 字段、调试工作流）：[docs/HOOKS-API.zh-CN.md](docs/HOOKS-API.zh-CN.md)
- 架构、stage 表、node 契约：[docs/ARCHITECTURE.zh-CN.md](docs/ARCHITECTURE.zh-CN.md)
- 扩展指南：hook vs preset node vs 新 preset：[docs/EXTENDING.zh-CN.md](docs/EXTENDING.zh-CN.md)

## 许可证

MIT
