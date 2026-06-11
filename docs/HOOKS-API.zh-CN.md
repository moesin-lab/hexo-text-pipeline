[English](HOOKS-API.md) | **简体中文**

# Hooks 接口文档

开发自定义 hook 需要的全部信息。何时选 hook、何时写 preset node，见 [EXTENDING.zh-CN.md](EXTENDING.zh-CN.md)。

## 开发工作流

```
1. 在 _config.yml 声明 hook                 （stage + script/command）
2. 打开 tap，渲染一次                        → 看到你的 hook 实际收到什么
3. 对着这份输入写变换逻辑
4. hexo pipeline --dry-run <file>           → 不生成站点，直接看 diff
5. 迭代——脚本改完下一次渲染即生效，不用重启
```

## Stage 参考：你的 hook 收到什么

| Stage | 输入文本 | 频率 | 拿到的 `post` / `data` |
|-------|---------|------|------------------------|
| `before_post_render` | 文章的 **markdown**，frontmatter 已剥离 | 每篇文章/页面一次 | 完整 post 对象：`title`、`source`（`_posts/x.md`）、`path`、`slug`、frontmatter 字段 |
| `after_post_render` | 文章**渲染后的 HTML 片段**（无布局） | 每篇文章/页面一次 | 同上 |
| `after_render:html` | **完整页面 HTML**，含布局、`<head>`、注入的资源 | 每个生成页面一次（文章、首页、归档…） | 输出文件的 `{ path }` |
| `after_render:css` / `:js` | 生成资源的完整文本 | 每个资源一次 | `{ path }` |

### 挂点（slot）：early 与 late

你的 hook 具体收到什么，取决于它的**挂点**：

- `slot: late`（hook 的默认值）——在 Hexo 内置 filter 和其他插件**之后**运行。在 `before_post_render` 上意味着：preset node 已经跑完，围栏代码块已被高亮器吞成 `<hexoPostRenderCodeBlock>` 占位符——你不可能误伤代码，看到的就是真正要渲染的内容。
- `slot: early`——抢在所有人**之前**，拿原始文本。需要完整围栏代码块、原始 `%%注释%%` 等时选它。

`before_post_render` **early** 挂点的输入实例（tap 抓取的真实样本）：

```markdown
Link to [[Other Post]] and *quiet* words. %%hidden note%% PIPE here.

> [!note] Heads up
> callout body

```mermaid
graph TD
A --> B
```
```

同一篇文章在 `before_post_render` **late** 挂点的输入——early 的 preset node（wikilink/comment/mermaid）已生效，普通代码块也已被 Hexo 高亮器包成占位符：

```markdown
Link to [Other Post](/posts/xyz789) and *quiet* words.  PIPE here.

> [!note] Heads up
> callout body

<pre class="mermaid">graph TD
A --&gt; B</pre>

<hexoPostRenderCodeBlock><figure class="highlight js">…</figure></hexoPostRenderCodeBlock>
```

别靠猜——开一次 tap，读你目标 stage 和挂点的 `00-input.txt`（见文末）。

## Script hook

```yaml
hooks:
  - script: scripts/my-hook.js   # 相对 Hexo 根目录解析
    stage: after_post_render
```

```js
// scripts/my-hook.js
module.exports = function (text, ctx) {
  // text：该 stage 当前的完整文本（前面的 node 已经跑过）
  // 必须返回字符串——返回其他类型会被拒收，原文继续流向下一环
  return text.replace(/\bfoo\b/g, 'bar');
};
```

### `ctx` 字段

| 字段 | 内容 |
|------|------|
| `ctx.post` | post 对象（`post` 类 stage）或 `{ path }`（`string` 类 stage）——可读 `ctx.post.title`、`ctx.post.source`、frontmatter 字段 |
| `ctx.stage` | 当前 stage 名（一个脚本可以服务多个 stage） |
| `ctx.hexo` | 运行中的 Hexo 实例（`ctx.hexo.config`、`ctx.hexo.locals.get('posts')`…） |
| `ctx.config` | hook 没有子配置节，恒为 `{}`（preset node 在这里拿自己的子配置） |
| `ctx.pluginConfig` | 归一化后的 `text_pipeline` 配置 |
| `ctx.utils` | 工具函数，见下 |
| `ctx.log` | `ctx.log.warn(msg)` / `ctx.log.debug(msg)`，自动带 hook 名前缀 |

### `ctx.utils`

| 工具 | 用途 |
|------|------|
| `replaceOutsideCode(text, segment => newSegment)` | 对 markdown 做替换时**跳过围栏代码和行内代码**——`before_post_render` 行内改写的必备卫生 |
| `replaceOutsideInlineCode(line, fn)` | 同上，单行、只管行内代码 |
| `segmentInlineCode(line)` | 把一行拆成 `{ isCode, text }` 片段 |

```js
module.exports = (text, ctx) =>
  ctx.utils.replaceOutsideCode(text, (seg) => seg.replace(/==([^=]+)==/g, '<mark>$1</mark>'));
```

### 重载语义（即改即用）

脚本文件**以及它 require 的本地模块**（`./helper`，不含 node_modules）每次执行都重新加载。`hexo s` 下保存文件，下一次渲染就用新代码。不要在脚本里放模块级状态——两次执行之间不保留。

## Command hook

```yaml
hooks:
  - command: python scripts/furigana.py    # 经 shell 执行
    stage: before_post_render
    timeout: 10000                          # 毫秒，默认 10000
    match: '\\{ruby'                        # 可选：文本不命中就跳过（省一次 spawn）
```

协议——纯文本进、纯文本出：

- **stdin**：该 stage 当前文本（UTF-8）
- **stdout**：变换后的文本（UTF-8）。你打印什么，新文本就是什么，逐字节
- **exit 0** = 成功；其他退出码 = 失败（stderr 前 500 字符进告警）

上下文走环境变量：

| 变量 | 内容 |
|------|------|
| `HTP_STAGE` | stage 名 |
| `HTP_POST_SOURCE` | 如 `_posts/my-post.md`（`string` 类 stage 为空） |
| `HTP_POST_PATH` | 文章/页面的输出路径 |
| `HTP_POST_TITLE` | 文章标题 |

```python
#!/usr/bin/env python3
import sys, os
text = sys.stdin.read()
if os.environ["HTP_STAGE"] == "before_post_render":
    text = text.replace("TODO", "✅")
sys.stdout.write(text)
```

命令**每篇文章每轮渲染 spawn 一次**——保持轻快，并用 `match` 跳过不需要处理的文章。

## Hook 条目全部字段

| 字段 | 必填 | 默认 | 含义 |
|------|------|------|------|
| `script` / `command` | 二选一 | — | 跑什么 |
| `stage` | 否 | `before_post_render` | 在哪跑 |
| `slot` | 否 | `late` | `late` = 在 Hexo 内置/其他插件之后（最终文本）；`early` = 抢在所有人之前（原始文本） |
| `priority` | 否 | `10` | 同挂点内小者先跑；同级按声明顺序 |
| `name` | 否 | `hook-<index>` | 日志 / tap / doctor 里的标识 |
| `match` | 否 | — | 正则；输入不命中则跳过 |
| `timeout` | 否 | `10000` | 毫秒，仅 command |
| `enable` | 否 | `true` | 快速开关 |

## 失败语义

- 抛异常、非零退出、返回非字符串 → 该 hook **被跳过并告警**，输入文本原样流向下一环。构建永远不会因为 hook 失败（除非 `strict: true`）。
- 连续失败 3 次 → 该 hook **本轮渲染熔断**（一条通知，而不是每篇文章一条告警）。下一轮渲染自动复位，脚本修好了自己回来。
- 非空输入被清空、或体积膨胀 20 倍 → 告警但放行。

## 调试

**tap**——真实渲染过程中，把每个 stage 实际流过的文本落盘：

```yaml
text_pipeline:
  tap: { enable: true, match: my-post }
```

```
.text-pipeline-tap/_posts_my-post.md/<stage>.<slot>/
├── 00-input.txt          ← 你的 hook 收到的就是这个（同挂点更早的 node 已跑过）
├── 01-<node>.txt         ← 每个改动了文本的 node 改完后的样子
└── …                     ← 最后一个文件 = 该挂点的最终输出
```

**`hexo pipeline`**——解析后的执行顺序（我的 hook 在我以为的位置吗？）。

**`hexo pipeline --dry-run source/_posts/x.md`**——对单个文件跑 `before_post_render` 链，逐 node（包括你的 hook）打印行级 diff，不生成站点。
