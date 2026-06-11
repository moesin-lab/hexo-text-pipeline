'use strict';

const { STAGES } = require('./stages');
const { resolvePlacement, resolveConvert, DEFAULT_PRIORITY } = require('./node-contract');
const guard = require('./markdown-guard');

/**
 * 中央 node 注册表。engine 在 filter 执行时懒查询，所以注册可以发生在任何时刻
 * （配置加载、preset 加载、其他插件经 hexo.textPipeline.register 程序化注册）。
 *
 * node 统一契约（唯一接口）：
 * {
 *   name,                       // 唯一标识；preset 的 node 自动带 '<preset>:' 前缀
 *   stage,                      // stages.js 表里的键，默认 before_post_render
 *   slot: 'early' | 'late',     // 挂点：early 在 hexo 内置/其他插件之前，late 在其之后
 *                               // 默认值见 node-contract.js 的 SLOT_DEFAULTS（preset early，hook/api late）
 *   priority: 10,               // 同挂点内小者先跑，同级按注册顺序
 *   test(text),                 // 可选，廉价预判；match（正则）是它的声明式写法
 *   convert(text, ctx),         // 纯函数：文本进、文本出；replace 规则表是它的声明式写法
 *                               // （[[RegExp, 替换], ...]，markdown 阶段自动套 markdown-guard）
 *   css, js,                    // 可选，默认样式/前端脚本
 *   config, presetConfig,       // 可选；存在时原样出现在 ctx 上（hook 没有，ctx 上也不会有）
 *   origin,                     // 'preset:<name>' | 'hook:command' | 'hook:script' | 'api'
 * }
 *
 * 放置字段的默认值与校验统一在 node-contract.js——register 与 config hooks /
 * preset 加载共享同一套规则。
 */
function createRegistry() {
  const entries = [];
  let seq = 0;

  return {
    add(node) {
      entries.push({ node, seq: (seq += 1) });
    },
    // slot 省略时返回该 stage 全部 node（doctor 用）；指定时只返回该挂点的
    forStage(stage, slot) {
      return entries
        .filter((entry) => entry.node.stage === stage && (!slot || (entry.node.slot || 'early') === slot))
        .sort((a, b) => {
          const pa = Number.isFinite(a.node.priority) ? a.node.priority : DEFAULT_PRIORITY;
          const pb = Number.isFinite(b.node.priority) ? b.node.priority : DEFAULT_PRIORITY;
          return pa - pb || a.seq - b.seq;
        })
        .map((entry) => entry.node);
    },
    all() {
      return entries.map((entry) => entry.node);
    }
  };
}

/**
 * 暴露为 hexo.textPipeline 的程序化 API：其他插件/脚本也能往管线挂 node。
 * utils 给 script hook 用（如在 markdown 阶段跳过代码块）。
 */
function createPublicApi(registry, { onRegister, log } = {}) {
  return {
    stages: Object.keys(STAGES),
    utils: {
      replaceOutsideCode: guard.replaceOutsideCode,
      replaceOutsideInlineCode: guard.replaceOutsideInlineCode,
      segmentInlineCode: guard.segmentInlineCode
    },
    register(node) {
      if (!node || typeof node.name !== 'string' || !node.name) {
        throw new TypeError('textPipeline.register expects { name, stage, convert(text, ctx) | replace }');
      }
      const resolved = resolvePlacement(node, 'api');
      if (resolved.error) {
        throw new TypeError('textPipeline.register: ' + resolved.error);
      }
      const converted = resolveConvert(Object.assign({}, node, { stage: resolved.placement.stage }));
      if (converted.error) {
        throw new TypeError('textPipeline.register: node "' + node.name + '" ' + converted.error);
      }
      const wrapped = Object.assign({ origin: 'api' }, node, {
        stage: resolved.placement.stage,
        slot: resolved.placement.slot,
        priority: resolved.placement.priority,
        convert: converted.convert
      });
      if (typeof wrapped.test !== 'function' && resolved.placement.test) {
        wrapped.test = resolved.placement.test;
      }
      // 与启动期 checkNodes 同一条规则：重名不拦截，但要告警（日志/tap/doctor 里分不清）
      if (log && registry.all().some((existing) => existing.name === wrapped.name)) {
        log.warn('duplicate node name "' + wrapped.name + '" — both will run; rename one to tell them apart in logs');
      }
      registry.add(wrapped);
      if (typeof onRegister === 'function') onRegister(wrapped);
      return wrapped;
    }
  };
}

module.exports = {
  createRegistry,
  createPublicApi,
  DEFAULT_PRIORITY
};
