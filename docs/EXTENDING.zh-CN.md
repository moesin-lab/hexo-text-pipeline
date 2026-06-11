[English](EXTENDING.md) | **简体中文**

# 扩展管线

三个升级层级。从最上面开始；只有上一级真的不够用时才往下走。

## 第 1 级：站点仓库里的用户 hook（默认答案）

站点专属的变换 → 完全不需要碰这个仓库：

```yaml
text_pipeline:
  hooks:
    - script: scripts/my-transform.js   # module.exports = (text, ctx) => text
      stage: before_post_render
```

改脚本、重新渲染、完事。markdown 阶段做行内替换时用 `ctx.utils.replaceOutsideCode(text, fn)` 跳过代码块。非 JS 逻辑走 `command:`（stdin → stdout）。

完整契约——各 stage 输入形态、`ctx` 字段、环境变量、调试工作流：[HOOKS-API.zh-CN.md](HOOKS-API.zh-CN.md)。

## 第 2 级：往现有 preset 加 node

适用于该 preset 的所有用户都需要的语法（如给 `obsidian` preset 加一种新 Obsidian 语法）：

1. **先写验收用例**：在 `test/<name>.test.js` 里添加 输入 → 期望输出 对（输入是 markdown 还是 HTML 取决于 stage）。
2. **复制模板**：`cp -r lib/presets/obsidian/converters/_template lib/presets/obsidian/converters/<name>`，改 `name`。
3. **选 stage**（全表见 `lib/core/stages.js`）：
   - 结果仍是 markdown（如 `==高亮==` → `<mark>`）→ `before_post_render`；行内替换必须用 `markdown-guard` 的 `replaceOutsideCode` 包住
   - 依赖渲染后的 HTML 结构（如 callout 基于 `<blockquote>`）→ `after_post_render`
4. **实现**：解析放 `parse.js`，输出放 `render.js`（简单语法可全放 `index.js`）。默认样式走 `css` 字段，前端加载脚本走 `js`。如果多数渲染器已自带该行为，出厂 `enabledByDefault: false`。
5. **注册**：在 preset 的 `nodes` 数组（`lib/presets/obsidian/index.js`）加一行——数组顺序就是同 priority 下的执行顺序。
6. **验证**：`npm test` 全绿；`hexo pipeline` 里 node 出现在预期位置。
7. **写文档**：更新中英两份 README 的 preset node 表。

## 第 3 级：写一个新 preset

有独立主题的可复用 node 集（如 `typography` preset）：

```js
// lib/presets/<name>/index.js —— 独立 npm 包也是同样的形状
module.exports = {
  name: 'typography',
  nodes: [require('./nodes/smart-quotes'), require('./nodes/widows')],
  init(hexo) {}   // 可选：一次性副作用（额外 filter、缓存）
};
```

用户按内置名、npm 包名或本地路径加载：

```yaml
presets:
  - typography                  # 内置（lib/presets/）或 npm 包
  - ./pipeline/my-preset        # 站点本地目录
  - name: typography            # 带配置
    config:
      smart-quotes: { enable: false, priority: 15 }
```

node 级配置进 `ctx.config`（`config.<nodeName>` 节）；preset 级配置进 `ctx.presetConfig`。

## Obsidian 语法路线图

| 语法 | 形式 | 状态 | 建议 stage |
|------|------|------|-----------|
| 内部链接 | `[[Link]]` | ✅ wikilink | before |
| 注释 | `%%Text%%`（行内与跨行） | ✅ comment | before |
| Mermaid 图表 | ` ```mermaid ` 块 | ✅ mermaid | before |
| Callout | `> [!note]` | ✅ callout（默认关闭） | after |
| 残留 .md 链接 | `[x](a.md)` / `href="a.md"` | ✅ mdlink | after |
| 高亮 | `==Text==` | ⬜ | before |
| 文件/笔记嵌入 | `![[Link]]` | ⬜ | before |
| 块引用 | `![[Link#^id]]` | ⬜ | before |
| 块定义 | `^id` | ⬜ | before |
| 脚注 | `[^id]` | ⬜（渲染器配置可能已覆盖） | — |
| 删除线 / 任务列表 / 表格 | `~~ ~~` / `- [ ]` | 无需处理（marked 原生支持） | — |
