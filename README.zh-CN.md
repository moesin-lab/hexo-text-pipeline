[English](README.md) | **简体中文**

# hexo-obsidian-compiler

Hexo 渲染管线上的文本变换总线，预装一组 Obsidian Flavored Markdown 转换器。

一个插件，两件事：

1. **内置 converter**：把 Obsidian 语法（wiki 链接、注释、mermaid、callout……）编译成 Hexo 友好的输出。
2. **用户 hook**：把 Hexo 渲染管线上所有"文本进、文本出"的执行点暴露给你自己的脚本——在 `_config.yml` 里声明一条 shell 命令或一个本地 JS 文件，即可接管任意阶段。改完脚本重新渲染就生效：不用写插件，不用重启。

设计目标：绝大多数小型 Hexo 插件做的事，本质都是"在管线的某个点变换一段文本"。这种事不该需要发布一个插件——一段脚本加一行配置就该够了。

本项目是 [hexo-obsidian-link-converter](https://github.com/Sentixxx/hexo-obsidian-link-converter) 的演进版，wiki 链接转换已作为 converter 并入。

## 内置 converter

| Converter | 语法 | 默认 | 行为 |
|-----------|------|------|------|
| `comment` | `%%行内%%` 与跨行 `%% … %%` | 开 | 在 markdown 渲染前剥离（代码内为字面量） |
| `wikilink` | `[[目标#锚点\|别名]]` | 开 | 重写为指向文章永久链接的 markdown 链接 |
| `mdlink` | 渲染后残留的 `.md` 链接 | 开 | 兜底重写为文章永久链接 |
| `mermaid` | ` ```mermaid ` 围栏块 | 开 | 替换为 `<pre class="mermaid">`，绕开语法高亮；默认按需注入加载脚本（CDN、懒加载），可关闭 |
| `callout` | `> [!type] 标题` + 引用体 | **关** | 渲染为 `<div class="callout callout-type">`；主流渲染器/主题已多自带 callout 支持，需要时再打开 |

链接目标按标题 / slug / 源文件路径匹配。frontmatter 的 `abbrlink` 优先（→ `/posts/<abbrlink>`），没有 `abbrlink` 的文章回退到 Hexo 生成的 `post.path`，都解析不到则原样保留。

## 安装

```bash
npm install hexo-obsidian-compiler --save
```

## 配置（`_config.yml`，全部可选）

```yaml
obsidian_compiler:
  enable: true          # 总开关
  debug: false          # 详细日志
  inject_css: true      # 注入默认 callout 样式
  inject_js: true       # 注入 mermaid 加载脚本
  domain_prefix: ''     # 链接前缀，如 https://example.com/blog
  converters:
    callout:
      enable: true      # callout 默认关闭，需要时在这里打开
    mermaid:
      theme: default    # 传给 mermaid.initialize 的主题
      script_src: ''    # 覆盖 CDN 地址；inject_script: false 则完全自备
  hooks:                # 用自己的脚本接管管线 ↓
    - command: python scripts/furigana.py
      stage: before_post_render
    - script: scripts/lazy-img.js
      stage: after_post_render
```

## 用户 hook：接管任意阶段

Hexo 渲染管线上每个有文本流经的点都暴露为一个 stage：

| Stage | 流经的文本 |
|-------|-----------|
| `before_post_render` | 单篇文章的 **markdown**（渲染前） |
| `after_post_render` | 单篇文章的 **HTML 片段**（渲染后） |
| `after_render:html` | 模板套完后的**完整页面 HTML** |
| `after_render:css` / `after_render:js` | 生成的静态资源 |

两种 hook 形态，都严格 text in, text out：

```yaml
hooks:
  # 外部命令：正文从 stdin 进，变换结果从 stdout 出，任何语言都行。
  # 上下文走环境变量：HOC_STAGE / HOC_POST_SOURCE / HOC_POST_PATH / HOC_POST_TITLE。
  - command: python scripts/furigana.py
    stage: before_post_render   # 默认 stage
    name: furigana              # 可选，日志标识
    timeout: 10000              # 可选，毫秒

  # 本地 JS：module.exports = (text, ctx) => text
  # 相对 Hexo 根目录解析，每次执行重新加载——改完即生效，不用重启。
  - script: scripts/minify.js
    stage: after_render:html
```

执行语义：

- 同一 stage 内：内置 converter 先跑（registry 顺序），hook 后跑（配置顺序）。
- hook 失败（非零退出、抛异常、返回非字符串）只跳过自身并 warn，原文继续流向下一环——构建永远不会因为一个 hook 挂掉。
- script hook 的 `ctx` 为 `{ hexo, post, stage, config, pluginConfig, log }`。

## Callout 输出结构（启用时）

```html
<div class="callout callout-diary" data-callout="diary">
  <div class="callout-title">2026-05-30 星期六</div>
  <div class="callout-content"><p>…</p></div>
</div>
```

折叠标记 `[!type]-` / `[!type]+` 渲染为 `<details>/<summary>`。`inject_css: false` 可把样式完全交给主题。

## 开发

零运行时依赖，Node >= 16。

```bash
npm test   # node --test
```

- 架构、stage 表、converter/hook 接口契约：[docs/ARCHITECTURE.zh-CN.md](docs/ARCHITECTURE.zh-CN.md)
- 新增内置 converter 的操作步骤与语法路线图：[docs/ADDING-A-CONVERTER.zh-CN.md](docs/ADDING-A-CONVERTER.zh-CN.md)

## 许可证

MIT
