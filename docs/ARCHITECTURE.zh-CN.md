[English](ARCHITECTURE.md) | **简体中文**

# 架构

一句话：一个小内核（engine）按 Hexo 渲染阶段调度 N 个互相独立的 converter，每个 Obsidian 语法一个目录。

## 数据流

```
hexo generate
  └─ before_generate            engine: 失效 post-index 缓存
  └─ before_post_render         输入 markdown ── wikilink ──> markdown
  └─ (hexo-renderer-marked 渲染 markdown → HTML)
  └─ after_post_render          输入 HTML ── callout ──> ── mdlink ──> HTML
```

## Converter 接口（唯一契约）

```js
module.exports = {
  name: 'callout',            // 配置键名：obsidian_compiler.converters.<name>
  stage: 'after_post_render', // 'before_post_render'（markdown）| 'after_post_render'（HTML）
  css: '...',                 // 可选：默认样式，inject_css 开启时由 engine 注入 head_end
  test(content) {},           // 廉价预判，false 直接跳过 convert
  convert(content, ctx) {},   // 纯函数：返回新 content，不产生副作用
};
```

`ctx = { hexo, post, config, pluginConfig, log }`：

- `config`：本 converter 的子配置（`converters.<name>`）
- `pluginConfig`：归一化后的全局配置（含 `domainPrefix` 等）
- `log.debug / log.warn`：带 converter 名前缀的日志

## 职责边界

engine（`lib/core/engine.js`）负责所有横切关注点，converter 一概不管：

- 按 stage 分组注册 filter，registry 顺序即同 stage 执行顺序
- enable 开关（全局 + 每 converter）
- 异常隔离：单个 converter 抛错只 warn 并跳过，不让构建失败
- CSS 注入、post-index 缓存失效

core 提供两个共享服务，converter 按需引用：

- `markdown-guard`：before 阶段做行内替换时跳过 fenced/inline code
- `post-index`：文章多键索引（title/slug/source 路径）→ 永久链接。
  abbrlink（frontmatter 标签）优先，缺失时兜底用 hexo 生成的 `post.path`，都没有则不改写

## 设计决策记录

| 决策 | 理由 |
|------|------|
| callout 在 `after_post_render`（HTML 阶段）处理 | 正文里的行内代码、加粗等 markdown 此时已被 renderer 渲染好；markdown 阶段方案需要自己递归调渲染器（marked 不渲染块级 HTML 内部的 markdown），是最大的坑 |
| 显式注册表而非目录扫描 | 执行顺序可见可控，grep `registry.js` 即知全部语法；AI 增改语法时 diff 可预测 |
| `convert` 为纯函数，hexo 依赖经 ctx 注入 | 单测不用 mock filter 机制；AI 可以孤立推理单个 converter |
| 零运行时依赖 | 与前身 hexo-obsidian-link-converter 一致；HTML 处理用索引扫描而非引入解析库，体量可控 |
| abbrlink 优先、`post.path` 兜底 | abbrlink 来自 frontmatter 标签（用户现有工作流）；无标签的文章退回 hexo permalink 生成的路径，仍可被链接 |
| 默认 CSS 经 injector 注入、可一键关闭 | 插件开箱可用；主题已有 callout 样式时 `inject_css: false` 完全让位 |

## 约束（保持架构窄而深的纪律）

1. converter 之间不互相 require；共享逻辑下沉到 `lib/core/`
2. `convert` 必须无副作用 —— 单测不需要 mock hexo filter 机制
3. 注册表是显式数组（`lib/converters/registry.js`），不做目录扫描
4. 内核不随语法数量增长；新语法的 diff 应局限在一个新目录 + registry 一行
