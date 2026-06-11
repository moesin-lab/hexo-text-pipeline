[English](ARCHITECTURE.md) | **简体中文**

# 架构

一句话：一个小内核在每个暴露的渲染 stage 上跑一条文本变换流水线；preset 节点、用户 hook、API 注册的节点是同一种 node，按 priority 调度，checker 系统全程兜底。

## 数据流

```
hexo generate
  └─ before_post_render         markdown ──[node 按 priority]──> markdown
  └─ （markdown 渲染器：markdown → HTML）
  └─ after_post_render          HTML ──[nodes]──> HTML
  └─ （模板渲染：HTML 片段 → 完整页面）
  └─ after_render:html          页面 HTML ──[nodes]──> 页面 HTML
  └─ after_render:css / :js     静态资源 ──[nodes]──> 静态资源
```

## 模块地图

```
lib/core/
├─ stages.js          # stage 表——暴露什么的唯一事实来源
├─ engine.js          # 唯一调度者：检查 → 加载 → 注册 filter → 受护执行
├─ config.js          # 声明式配置归一化（text_pipeline.*）
├─ api.js             # 中央 node 注册表 + hexo.textPipeline 公开 API
├─ markdown-guard.js  # 共享工具：感知围栏/行内代码的安全替换
├─ loaders/
│  ├─ hooks.js        # hooks: [] 配置条目 → node（分发给 script/command）
│  ├─ script.js       # 本地 JS，每次执行重新加载（即改即用）
│  ├─ command.js      # 外部命令，stdin → stdout
│  └─ preset.js       # 内置名 / npm 包 / 本地路径 → 一组 node
├─ checker/
│  ├─ static.js       # 注册期检查（schema、stage、重名、顺序歧义）
│  └─ runtime.js      # 执行期守卫（隔离、熔断、输出异常）
└─ console/
   └─ pipeline.js     # `hexo pipeline` 诊断命令
lib/presets/
└─ obsidian/          # 内置 preset：5 个 node + post-index 服务
```

## stage 表（`stages.js`）

只收 Hexo 里"文本进、文本出"的 filter 执行点——这是总线的边界。每个 stage 声明 `kind`，告诉 engine 如何适配 filter 签名：

- `post`：filter 收 post 对象，文本在 `data.content`（逐篇文章）
- `string`：filter 收 `(text, data)` 并返回新文本（整页/资源）

每个 stage 在 hexo filter 上**挂两次**，把 Hexo 内置 filter 和其他插件夹在中间：

```
[5]   early 挂点   ← preset node 默认在这里（需要原始文本；如 mermaid 必须
                     在 backtick_code_block 吞掉围栏代码块之前看到它）
[10]  hexo 内置 filter、其他插件
[100] late 挂点    ← 用户 hook 默认在这里（看到该 stage 的最终文本）
```

node 用 `slot: 'early' | 'late'` 在两个挂点间移动。

新增 stage = 表里加一项，engine、checker、doctor 自动覆盖。

## node：唯一契约

```js
{
  name: 'callout',            // 唯一标识；preset 的 node 自动带 '<preset>:' 前缀
  stage: 'after_post_render', // stage 表里的任意键，默认 before_post_render
  slot: 'early',              // 'early'（preset 默认）| 'late'（hook / plugin / api 默认）
  priority: 10,               // 同挂点内小者先跑，同级按注册顺序
  enabledByDefault: false,    // 可选；用户的 enable 永远优先
  test(text) {},              // 可选，廉价预判；match 正则是它的声明式写法
  convert(text, ctx) {},      // 纯函数：文本进、文本出；replace 规则表是它的声明式写法
                              // （markdown 阶段自动套 markdown-guard）
  css: '...',                 // 可选：注入 head_end（inject_css）
  js: (config) => '...',      // 可选：注入 body_end（inject_js）
}
```

`ctx = { hexo, stage, pluginConfig, utils, log }`，外加：`post` 类 stage 有 `ctx.post`、`string` 类有 `ctx.file`（`{ path }`）；`config` / `presetConfig` 仅在 node 自带配置时出现（即 preset node——hook 的 ctx 上没有这两个字段）。

四种挂载机制产出完全相同的形状，放置字段（stage / slot / priority / match）的默认值与校验集中在 `node-contract.js`，四条路径共用一份规则：

- **preset loader**：名字加命名空间（`obsidian:callout`），从 preset 配置节解析 node 级 config/enable/slot/priority，收集 `init(hexo)` 一次性副作用
- **hook loaders**：把脚本路径或命令字符串包装成 `convert`
- **plugin-dir loader**：站点 `text-pipeline/` 目录零配置自动发现，单文件即插件（name 缺省取文件名，`plugins.<name>` 配置覆盖，convert/replace/test/match 热重载）——见 [PLUGINS.zh-CN.md](PLUGINS.zh-CN.md)
- **公开 API**：`hexo.textPipeline.register(node)` 随时校验并加入（重名同样告警）——engine 在 filter 执行时懒查注册表，晚注册天然生效

加载顺序 preset → hook → plugin，同 stage 同挂点同 priority 时即注册顺序。

## checker 系统（三道防线）

1. **静态（注册期，`checker/static.js`）**——未知配置键（带编辑距离的 did-you-mean 建议）、非法 stage、重名、priority 类型错误、脚本文件缺失（仅提示——文件可以等会儿再建）、**不同来源**的 node 共享同 stage 同 priority 时的顺序歧义提示（同来源共享是正常的声明顺序）。
2. **运行期（每次执行，`checker/runtime.js`）**——异常 / 返回非字符串 → 跳过该 node，原文继续；连续失败 3 次 → 熔断，该 node 整轮禁用（不会每篇文章刷一遍日志）；非空输入被清空、或体积膨胀 20 倍 → 标记但放行（两者都可能是正常行为）。
3. **诊断（`hexo pipeline`）**——打印每个 stage 解析后的 node 顺序（priority + 来源）和全部静态检查结果。

`strict: true` 升级处理：静态 error 和运行期失败直接抛出——给 CI 用，坏 hook 就该让构建失败。

## 设计决策记录

| 决策 | 理由 |
|------|------|
| 通用 hooks 总线是产品本体，Obsidian 是 preset | 绝大多数小型 Hexo 插件本质是"在管线某点变换文本"；总线把它变成一段脚本加一行配置。Obsidian 编译只是第一个打包好的 node 集 |
| preset 节点 / hook / API 节点共用一个契约 | engine 只调度一种东西，checker 只检查一种东西，文档只描述一种东西，没有特权路径 |
| 放置字段归一化单点（`node-contract.js`） | 注册路径曾各自处理 stage/slot/priority/match 的默认值与校验，同一字段在不同入口行为分裂（如 slot 默认值不一致）；收敛成一份规则后，差异只剩按角色设的 slot 默认值，且集中在一张表里可见 |
| 单文件插件目录（plugin-dir，零配置自动发现） | "写插件 = 写一个文件"：站点级扩展不该需要发包，也不该需要两处声明（脚本 + YAML 条目）；replace 是 convert 的声明式写法（如同 match 之于 test），常见正则替换连函数都不用写。placement 注册期固化、逻辑热重载——与 hexo filter 不可反注册的事实对齐 |
| priority 数字 + 注册顺序兜底 | 与 Hexo 自己的 filter 优先级模型一致；要紧时显式，不要紧时无感。doctor 直接打印解析后顺序，永远不用猜 |
| 双挂点：preset 早、hook 晚 | preset 需要原始文本（真实站点验证过：hexo 的 `backtick_code_block` 优先级 10，否则会先把围栏代码块吞掉，mermaid 看不到）；hook 想要最终文本、也不该误伤代码。把 hexo 内置夹在中间同时满足两边默认，`slot` 字段随时覆盖 |
| script hook 每次执行重新 require | 即改即用：`hexo server` 下改脚本，下一次渲染就生效——"用脚本接管"可用性的关键反馈回路 |
| 默认 warn-and-skip，strict 可选 | 用户可以无心理负担地试错——实验失败的代价是一条 warn，不是一次部署失败。CI 切 strict |
| 连续失败 3 次熔断 | 一个在第 1 篇就坏掉的 hook，否则会对 500 篇文章刷 500 条相同告警、跑 500 次无谓 spawn |
| 输出异常只告警不否决 | 清空（注释剥离）和膨胀（资源内联）有时是有意为之；checker 的职责是可见性，不是一票否决 |
| filter 执行时懒查注册表 | 注册可以发生在任何时刻（配置、preset、其他插件的 textPipeline.register），不用重新接线 |
| 只暴露文本类 filter 点 | 让每个 node 都是 `(text, ctx) => text`；非文本 filter 上这条总线没有收益 |
| 唯一运行时依赖：hexo-util | 总线必须比它要取代的东西更轻，所以编辑距离、markdown 扫描等都内联实现；但锚点 slug（`slugize`）必须与 hexo 渲染器**同源**——自己实现一份规则稍有出入页内跳转就断。hexo-util 是 Hexo 本体的依赖，宿主站点必然已有，npm 去重后安装成本为零（版本范围放宽到 ^2.7 ‖ ^3 ‖ ^4 以匹配各版本 Hexo 自带的那份） |

## 约束（让架构保持窄而深的纪律）

1. node 之间永不互相 require；共享逻辑下沉到 `lib/core/`（或 preset 自己的目录）
2. `convert` 必须无副作用——单测不需要 mock hexo filter 机制
3. preset 的 node 列表是显式数组，不做目录扫描
4. 内核不随 preset 或 node 数量增长；新 stage 是一行表项，新 preset 是一个目录
5. 动手写 preset node 之前，先问：放在站点仓库里的一个用户 hook 是不是就够了
