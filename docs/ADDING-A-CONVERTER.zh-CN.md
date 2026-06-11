[English](ADDING-A-CONVERTER.md) | **简体中文**

# 新增一个语法 converter（SOP）

按序执行，全程不需要改 `lib/core/`。

1. **先写验收用例**：在 `test/<name>.test.js` 写 input → expected 对（输入是 markdown 还是 HTML 取决于第 3 步选的 stage）。
2. **复制模板**：`cp -r lib/converters/_template lib/converters/<name>`，改 `name` 字段。
3. **选 stage**：
   - 语法改写结果仍是 markdown（如 `==高亮==` → `<mark>`、`%%注释%%` → 删除）→ `before_post_render`，行内替换必须用 `core/markdown-guard` 的 `replaceOutsideCode` 包住，避免改写代码块。
   - 需要基于渲染后的 HTML 结构（如 callout 基于 `<blockquote>`）→ `after_post_render`，不需要 guard。
4. **实现**：解析逻辑放 `parse.js`、输出放 `render.js`（简单语法可以只留 `index.js`）。需要文章索引用 `core/post-index`。需要默认样式则加 `styles.js` 并在 `index.js` 挂到 `css` 字段。
5. **注册**：在 `lib/converters/registry.js` 加一行 `require('./<name>')`。
6. **验证**：`npm test` 全绿。
7. **文档**：在 README（中英两份）的语法支持表更新状态。

## 语法路线图（来自 Obsidian Flavored Markdown 官方清单）

| 语法 | 形式 | 状态 | 建议 stage |
|------|------|------|-----------|
| 内部链接 | `[[Link]]` | ✅ wikilink | before |
| 标注 | `> [!note]` | ✅ callout | after |
| .md 残留链接 | `[x](a.md)` / `href="a.md"` | ✅ mdlink | after |
| 高亮 | `==Text==` | ⬜ | before |
| 注释 | `%%Text%%` | ⬜ | before |
| 文件/笔记嵌入 | `![[Link]]` | ⬜ | before |
| 块引用 | `![[Link#^id]]` | ⬜ | before |
| 块定义 | `^id` | ⬜ | before |
| 脚注 | `[^id]` | ⬜（renderer 配置可能已覆盖） | — |
| 删除线 / 任务列表 / 表格 | `~~ ~~` / `- [ ]` | 无需处理（marked 原生支持） | — |
