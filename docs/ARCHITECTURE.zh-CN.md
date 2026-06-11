[English](ARCHITECTURE.md) | **简体中文**

# 架构

一句话：一个小内核（engine）在每个暴露的渲染 stage 上跑一条文本变换流水线；内置 converter 和用户配置的 hook 是流水线上同一种节点。

## 数据流

```
hexo generate
  └─ before_generate            engine：失效 post-index 缓存
  └─ before_post_render         markdown ── comment ── wikilink ── mermaid ── [hooks…] ──> markdown
  └─ （markdown 渲染器：markdown → HTML）
  └─ after_post_render          HTML ── mdlink ── callout* ── [hooks…] ──> HTML        （*默认关闭）
  └─ （模板渲染：HTML 片段 → 完整页面）
  └─ after_render:html          页面 HTML ── [hooks…] ──> 页面 HTML
  └─ after_render:css / :js     静态资源 ── [hooks…] ──> 静态资源
```

## stage 表（`lib/core/stages.js`）

哪些 Hexo filter 执行点被暴露，以这张表为唯一事实来源。只收"文本进、文本出"的点——这是本插件的边界；非文本的 filter（`template_locals`、`server_middleware` 等）刻意不暴露，需要请直接注册 Hexo filter。

每个 stage 声明一个 `kind`，告诉 engine 如何适配 Hexo filter 的签名：

- `post`：filter 收 post 对象，文本在 `data.content`（逐篇文章）
- `string`：filter 收 `(text, data)` 并返回新文本（整页 / 资源）

新增 stage = 在表里加一项，engine 不需要任何改动。

## 流水线节点接口（唯一契约）

```js
module.exports = {
  name: 'callout',            // 配置键：obsidian_compiler.converters.<name>
  stage: 'after_post_render', // stage 表里的任意键
  enabledByDefault: false,    // 可选：出厂默认关闭；用户的 converters.<name>.enable 永远优先
  css: '...',                 // 可选：注入 head_end 的样式（inject_css）
  js: (config) => '...',      // 可选：注入 body_end 的脚本（inject_js）；字符串或子配置的函数
  test(content) {},           // 廉价预判，false 直接跳过 convert
  convert(content, ctx) {},   // 纯函数：返回新文本，无副作用
};
```

`ctx = { hexo, post, stage, config, pluginConfig, log }`：

- `post`：post 对象（`post` 类 stage）或 `data` 元信息（`string` 类 stage，如 `{ path }`）
- `config`：本节点的子配置（`converters.<name>`）
- `pluginConfig`：归一化后的全局配置
- `log.debug / log.warn`：带节点名前缀的日志

用户 hook（`lib/core/user-hooks.js`）在注册时被包装成完全相同的形状，所以 engine 对内置和 hook 一视同仁地调度：

- `command` hook：正文 stdin 进 → 变换结果 stdout 出；上下文走 `HOC_*` 环境变量；任何语言
- `script` hook：本地 JS 文件导出 `(text, ctx) => text`，相对 Hexo 根目录解析，每次执行重新 require（改完下一次渲染即生效，不用重启）

## 职责边界

engine（`lib/core/engine.js`）独占所有横切关注点，节点永远不用操心：

- 按 stage 给活跃节点分组，每个 stage 注册一个 Hexo filter，按 stage 的 `kind` 适配签名
- 顺序：内置 converter（registry 顺序）在前，hook（配置顺序）在后
- 开关（全局、converter 级含 `enabledByDefault`、hook 级）
- 错误隔离：节点抛错或返回非字符串只 warn 并跳过，原文继续流动，构建永不失败
- CSS/JS 注入与 post-index 缓存失效
- 校验：未知 stage、非法 hook 条目 warn 后跳过

core 提供两个共享服务，节点按需取用：

- `markdown-guard`：markdown 阶段的代码围栏/行内代码感知（`replaceOutsideCode`、`segmentInlineCode`）
- `post-index`：多键文章索引（标题/slug/源路径）→ 永久链接；`abbrlink` 优先，回退 `post.path`

## 设计决策记录

| 决策 | 理由 |
|------|------|
| 用户 hook 作为一等机制（command + script，text in/text out） | 绝大多数小型 Hexo 插件本质是"在管线某点变换文本"；一段脚本加一行配置就能替代发布插件。unix 哲学：总线管调度，脚本干活 |
| `script` hook 每次执行重新 require | 即改即用：`hexo server` 下改脚本，下一次渲染就生效，不用重启——这是"用脚本接管"可用性的关键反馈回路 |
| hook 失败只跳过自身，永不炸构建 | 用户可以无心理负担地试错；实验失败的代价是一条 warn，不是一次部署失败 |
| 只暴露"文本进、文本出"的 filter 点 | 契约保持统一（每个节点都是 `(text, ctx) => text`）；非文本 filter 上这条总线没有收益 |
| `callout` 出厂 `enabledByDefault: false` | 现代渲染器/主题已自带 callout 渲染，二次处理会破坏输出；显式 `enable: true` 打开 |
| `mermaid` 在 markdown 阶段转成 `<pre class="mermaid">` | 语法高亮器在渲染期吃掉围栏代码块，提前换成原生块级 HTML 是唯一可靠的绕开方式。内容做 HTML 转义，浏览器经 `textContent` 还原给 mermaid.js |
| mermaid 加载脚本懒加载 | 注入的片段只在页面真的包含图表时才去拉 CDN |
| `comment` 在 markdown 阶段最先执行 | 被注释掉的语法（如 `%% %%` 里的 wiki 链接）必须在其他 converter 看到之前消失 |
| callout 在 `after_post_render`（HTML 阶段）处理 | 此时正文里的行内 markdown 已渲染完成；markdown 阶段方案得递归调渲染器 |
| 显式注册表而非目录扫描 | 执行顺序可见可控；grep `registry.js` 就能看到全部语法 |
| `convert` 是纯函数，hexo 依赖经 ctx 注入 | 单测不用 mock filter 机制；AI 可以孤立推理单个节点 |
| 零运行时依赖 | HTML 处理用索引扫描而非解析器库 |
| `abbrlink` 优先、`post.path` 兜底 | `abbrlink` 来自用户既有工作流；没有它的文章也保持可链接 |

## 约束（让架构保持窄而深的纪律）

1. 流水线节点之间永不互相 require；共享逻辑下沉到 `lib/core/`
2. `convert` 必须无副作用——单测不需要 mock hexo filter 机制
3. 注册表是显式数组（`lib/converters/registry.js`），不做目录扫描
4. 内核不随语法数量增长；新语法的 diff 限于一个新目录加一行注册——而且动手写 converter 前先问：放在站点仓库里的一个用户 hook 是不是就够了
5. 新 stage 只经 stage 表扩展，engine 保持通用
