'use strict';

const FAILURE_TRIP_THRESHOLD = 3;
const EXPLOSION_RATIO = 20;
const EXPLOSION_MIN_BYTES = 64 * 1024;

/**
 * 运行期防护（兜底第二道防线）。每个 node 的每次执行都经过这里：
 *
 * - 硬防护：抛错 / 返回非字符串 → 丢弃该 node 的输出，原文继续流向下一环；
 *   strict 模式下改为抛出，让构建失败（给 CI 用）。
 * - 熔断：同一 node 连续失败 FAILURE_TRIP_THRESHOLD 次后整轮禁用，
 *   不再为每篇文章刷一遍相同的错误日志。
 * - 软告警（不拦截，输出仍被采纳）：输入非空但输出被清空；输出体积异常膨胀。
 *   这两种都可能是正常行为（如注释剥离/资源内联），所以只提醒。
 */
function createRuntimeGuard({ strict } = {}) {
  const failures = new Map(); // node -> consecutive failure count
  const tripped = new Set();

  return {
    run(node, text, ctx) {
      if (tripped.has(node)) {
        return text;
      }

      let output;
      try {
        output = node.convert(text, ctx);
        if (typeof output !== 'string') {
          throw new Error('returned ' + typeof output + ' instead of a string');
        }
      } catch (err) {
        if (strict) {
          throw new Error('[' + node.name + '] ' + (err && err.message));
        }
        const count = (failures.get(node) || 0) + 1;
        failures.set(node, count);
        ctx.log.warn(ctx.stage + ' failed, skipped: ' + (err && err.message));
        if (count >= FAILURE_TRIP_THRESHOLD) {
          tripped.add(node);
          ctx.log.warn('disabled for the rest of this run after ' + count + ' consecutive failures');
        }
        return text;
      }

      failures.set(node, 0);

      if (text.length > 0 && output.length === 0) {
        ctx.log.warn(ctx.stage + ' produced empty output from non-empty input (accepted — verify this is intended)');
      } else if (output.length > EXPLOSION_MIN_BYTES && output.length > text.length * EXPLOSION_RATIO) {
        ctx.log.warn(
          ctx.stage + ' output grew ' + Math.round(output.length / Math.max(text.length, 1)) + 'x (' + output.length + ' bytes) — verify this is intended'
        );
      }

      return output;
    },
    isTripped(node) {
      return tripped.has(node);
    }
  };
}

module.exports = { createRuntimeGuard, FAILURE_TRIP_THRESHOLD };
