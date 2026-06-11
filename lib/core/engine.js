'use strict';

const { normalizeConfig, converterConfig, isConverterEnabled } = require('./config');
const { invalidatePostIndex } = require('./post-index');

const STAGES = ['before_post_render', 'after_post_render'];

const registeredHexoInstances = new WeakSet();

function makeLogger(hexo, debug, name) {
  const prefix = '[obsidian-compiler' + (name ? ':' + name : '') + '] ';
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
 * 唯一调度者：把 registry 里启用的 converter 按 stage 分组，
 * 每个 stage 只注册一个 hexo filter，按 registry 顺序串行执行。
 * 单个 converter 抛错只跳过自身（warn），不让构建失败。
 */
function register(hexo, registry) {
  if (!hexo || !hexo.extend || !hexo.extend.filter || typeof hexo.extend.filter.register !== 'function') {
    return;
  }
  if (registeredHexoInstances.has(hexo)) {
    return;
  }
  registeredHexoInstances.add(hexo);

  const pluginConfig = normalizeConfig(hexo.config);
  if (!pluginConfig.enable) {
    return;
  }

  const active = registry.filter((conv) => isConverterEnabled(pluginConfig, conv.name));
  if (!active.length) {
    return;
  }

  const engineLog = makeLogger(hexo, pluginConfig.debug);

  hexo.extend.filter.register('before_generate', () => {
    invalidatePostIndex(hexo);
    engineLog.debug('post index invalidated');
  });

  for (const stage of STAGES) {
    const group = active.filter((conv) => conv.stage === stage);
    if (!group.length) continue;

    hexo.extend.filter.register(stage, (data) => {
      if (!data || typeof data.content !== 'string') {
        return data;
      }

      for (const conv of group) {
        if (typeof conv.test === 'function' && !conv.test(data.content)) continue;

        const log = makeLogger(hexo, pluginConfig.debug, conv.name);
        const ctx = {
          hexo,
          post: data,
          config: converterConfig(pluginConfig, conv.name),
          pluginConfig,
          log
        };

        try {
          data.content = conv.convert(data.content, ctx);
          log.debug(stage + ' applied source=' + (data.source || data.path || 'unknown'));
        } catch (err) {
          log.warn(stage + ' failed, skipped: ' + (err && err.message));
        }
      }

      return data;
    });
  }

  if (
    pluginConfig.injectCss &&
    hexo.extend.injector &&
    typeof hexo.extend.injector.register === 'function'
  ) {
    for (const conv of active) {
      if (conv.css) {
        hexo.extend.injector.register('head_end', '<style>' + conv.css + '</style>');
      }
    }
  }
}

module.exports = {
  register,
  registeredHexoInstances,
  STAGES
};
