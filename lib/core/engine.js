'use strict';

const { normalizeConfig, converterConfig, isConverterEnabled } = require('./config');
const { invalidatePostIndex } = require('./post-index');
const { createHookConverters } = require('./user-hooks');
const { STAGES } = require('./stages');

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
 * 唯一调度者：把内置 converter（registry）和用户 hook（配置里的 command / script）
 * 合成一条流水线，按 stage 分组接驳到对应的 hexo filter 上。
 *
 * - stage 表见 core/stages.js，全部是"文本进、文本出"的执行点；
 * - 同一 stage 内执行顺序：registry 顺序的内置 converter → 配置顺序的用户 hook；
 * - 任何一环抛错或返回非字符串只跳过该环（warn），原文继续流向下一环，构建不失败。
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

  const engineLog = makeLogger(hexo, pluginConfig.debug);

  const hookResult = createHookConverters(pluginConfig.hooks, hexo.base_dir);
  for (const reason of hookResult.invalid) {
    engineLog.warn('invalid hook skipped: ' + reason);
  }

  const active = registry
    .filter((conv) => isConverterEnabled(pluginConfig, conv))
    .concat(hookResult.converters);

  const grouped = new Map();
  for (const conv of active) {
    if (!STAGES[conv.stage]) {
      engineLog.warn(
        '"' + conv.name + '" targets unknown stage "' + conv.stage + '" (valid: ' + Object.keys(STAGES).join(', ') + ')'
      );
      continue;
    }
    if (!grouped.has(conv.stage)) grouped.set(conv.stage, []);
    grouped.get(conv.stage).push(conv);
  }

  if (!grouped.size) {
    return;
  }

  hexo.extend.filter.register('before_generate', () => {
    invalidatePostIndex(hexo);
    engineLog.debug('post index invalidated');
  });

  for (const [stageName, group] of grouped) {
    const runChain = (text, post) => {
      let current = text;

      for (const conv of group) {
        if (typeof conv.test === 'function' && !conv.test(current)) continue;

        const log = makeLogger(hexo, pluginConfig.debug, conv.name);
        const ctx = {
          hexo,
          post,
          stage: stageName,
          config: converterConfig(pluginConfig, conv.name),
          pluginConfig,
          log
        };

        try {
          const next = conv.convert(current, ctx);
          if (typeof next !== 'string') {
            throw new Error('converter returned ' + typeof next + ' instead of a string');
          }
          current = next;
          log.debug(stageName + ' applied source=' + ((post && (post.source || post.path)) || 'unknown'));
        } catch (err) {
          log.warn(stageName + ' failed, skipped: ' + (err && err.message));
        }
      }

      return current;
    };

    if (STAGES[stageName].kind === 'post') {
      hexo.extend.filter.register(stageName, (data) => {
        if (!data || typeof data.content !== 'string') {
          return data;
        }
        data.content = runChain(data.content, data);
        return data;
      });
    } else {
      hexo.extend.filter.register(stageName, (text, data) => {
        if (typeof text !== 'string') {
          return text;
        }
        return runChain(text, data || {});
      });
    }
  }

  const canInject = hexo.extend.injector && typeof hexo.extend.injector.register === 'function';
  if (canInject) {
    for (const conv of active) {
      if (pluginConfig.injectCss && conv.css) {
        hexo.extend.injector.register('head_end', '<style>' + conv.css + '</style>');
      }
      if (pluginConfig.injectJs && conv.js) {
        const js = typeof conv.js === 'function' ? conv.js(converterConfig(pluginConfig, conv.name)) : conv.js;
        if (js) {
          hexo.extend.injector.register('body_end', '<script>' + js + '</script>');
        }
      }
    }
  }
}

module.exports = {
  register,
  registeredHexoInstances,
  STAGES
};
