'use strict';

const { normalizeConfig } = require('./config');
const { STAGES, LATE_FILTER_PRIORITY } = require('./stages');
const { createRegistry, createPublicApi } = require('./api');
const { loadPresets } = require('./loaders/preset');
const { loadHooks } = require('./loaders/hooks');
const { checkPluginConfig, checkNodes } = require('./checker/static');
const { createRuntimeGuard } = require('./checker/runtime');
const { createTap } = require('./tap');
const { registerDoctorCommand } = require('./console/pipeline');

const registeredHexoInstances = new WeakSet();

function makeLogger(hexo, debug, name) {
  const prefix = '[text-pipeline' + (name ? ':' + name : '') + '] ';
  const hexoLog = hexo.log || {};
  return {
    debug(message) {
      if (!debug || typeof hexoLog.info !== 'function') return;
      hexoLog.info(prefix + message);
    },
    warn(message) {
      if (typeof hexoLog.warn === 'function') {
        hexoLog.warn(prefix + message);
      }
    }
  };
}

/**
 * 唯一调度者。注册流程（兜底链路）：
 *   1. 静态检查配置（checker/static）—— strict 下 error 直接让构建失败
 *   2. 加载 presets（插件的插件）与 hooks（用户脚本/命令）为统一 node
 *   3. node 级静态检查（stage、重名、priority、脚本可达性、顺序歧义）
 *   4. 为 stage 表里每个 stage 注册一个 hexo filter，执行时懒查注册表
 *      （所以 hexo.textPipeline.register 在任何时刻注册都生效）
 *   5. 执行期每个 node 过 runtime guard：异常隔离、熔断、输出异常告警
 *
 * 同 stage 内顺序：priority 小者先跑，同级按注册顺序（preset 在 hook 之前加载）。
 */
function register(hexo) {
  if (!hexo || !hexo.extend || !hexo.extend.filter || typeof hexo.extend.filter.register !== 'function') {
    return;
  }
  if (registeredHexoInstances.has(hexo)) {
    return;
  }
  registeredHexoInstances.add(hexo);

  registerDoctorCommand(hexo); // 禁用时也注册，`hexo pipeline` 会提示插件未启用

  const pluginConfig = normalizeConfig(hexo.config);
  if (!pluginConfig.enable) {
    return;
  }

  const engineLog = makeLogger(hexo, pluginConfig.debug);
  const baseDir = hexo.base_dir;

  const issues = checkPluginConfig(pluginConfig.raw);
  const presetResult = loadPresets(pluginConfig.presets, baseDir);
  const hookResult = loadHooks(pluginConfig.hooks, baseDir);
  issues.push(...presetResult.issues, ...hookResult.issues);

  const candidates = presetResult.nodes.concat(hookResult.nodes);
  issues.push(...checkNodes(candidates));

  if (pluginConfig.strict) {
    const errors = issues.filter((issue) => issue.level === 'error');
    if (errors.length) {
      throw new Error(
        '[text-pipeline] strict mode: config check failed\n  - ' + errors.map((e) => e.message).join('\n  - ')
      );
    }
  }
  for (const issue of issues) {
    if (issue.level === 'info') {
      engineLog.debug(issue.message); // 仅 debug / `hexo pipeline` 可见
    } else {
      engineLog.warn(issue.level + ': ' + issue.message);
    }
  }

  const registry = createRegistry();
  for (const node of candidates) {
    if (STAGES[node.stage]) registry.add(node);
  }

  const guard = createRuntimeGuard({ strict: pluginConfig.strict });
  hexo.extend.filter.register('before_generate', () => {
    guard.reset();
  });

  const tap = createTap(pluginConfig.tap, baseDir, engineLog);
  if (tap) {
    engineLog.warn('tap is ON — stage snapshots are written to ' + tap.root + ' (debug mode, disable for normal builds)');
  }

  const canInject = hexo.extend.injector && typeof hexo.extend.injector.register === 'function';
  const injectAssets = (node) => {
    if (!canInject) return;
    if (pluginConfig.injectCss && node.css) {
      hexo.extend.injector.register('head_end', '<style>' + node.css + '</style>');
    }
    if (pluginConfig.injectJs && node.js) {
      const js = typeof node.js === 'function' ? node.js(node.config || {}) : node.js;
      if (js) {
        hexo.extend.injector.register('body_end', '<script>' + js + '</script>');
      }
    }
  };

  const api = createPublicApi(registry, { onRegister: injectAssets });
  hexo.textPipeline = api;
  // doctor 命令与测试读取的内部状态
  hexo._textPipeline = { registry, issues, pluginConfig, guard };

  const runChain = (stageName, slot, text, post) => {
    let current = text;

    if (tap) tap.capture(stageName + '.' + slot, post, 'input', current);

    for (const node of registry.forStage(stageName, slot)) {
      if (typeof node.test === 'function' && !node.test(current)) continue;

      const log = makeLogger(hexo, pluginConfig.debug, node.name);
      const ctx = {
        hexo,
        post,
        stage: stageName,
        config: node.config || {},
        presetConfig: node.presetConfig || {},
        pluginConfig,
        utils: api.utils,
        log
      };

      const next = guard.run(node, current, ctx);
      if (next !== current) {
        log.debug(stageName + ' applied source=' + ((post && (post.source || post.path)) || 'unknown'));
        if (tap) tap.capture(stageName + '.' + slot, post, node.name, next);
      }
      current = next;
    }

    return current;
  };

  // 每个 stage 两个挂点：early 抢在 hexo 内置/其他插件之前，late 在其全部跑完之后
  for (const stageName of Object.keys(STAGES)) {
    const slots = [
      ['early', STAGES[stageName].filterPriority],
      ['late', LATE_FILTER_PRIORITY]
    ];
    for (const [slot, filterPriority] of slots) {
      if (STAGES[stageName].kind === 'post') {
        hexo.extend.filter.register(stageName, (data) => {
          if (!data || typeof data.content !== 'string') {
            return data;
          }
          data.content = runChain(stageName, slot, data.content, data);
          return data;
        }, filterPriority);
      } else {
        hexo.extend.filter.register(stageName, (text, data) => {
          if (typeof text !== 'string') {
            return text;
          }
          return runChain(stageName, slot, text, data || {});
        }, filterPriority);
      }
    }
  }

  for (const node of registry.all()) {
    injectAssets(node);
  }

  for (const { name, init } of presetResult.inits) {
    try {
      init(hexo);
    } catch (err) {
      engineLog.warn('preset "' + name + '" init failed: ' + (err && err.message));
    }
  }
}

module.exports = {
  register,
  registeredHexoInstances,
  STAGES
};
