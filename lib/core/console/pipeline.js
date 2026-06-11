'use strict';

const { STAGES } = require('../stages');

/**
 * `hexo pipeline` 诊断命令（兜底第三道防线）：上线前把整条管线摊开看。
 * 输出每个 stage 的 node 执行顺序（priority + 来源）和全部静态检查结果，
 * 冲突和顺序问题在生成站点之前就能看见。
 */
function formatReport(state) {
  const lines = [];
  lines.push('text-pipeline');
  lines.push('');

  for (const stageName of Object.keys(STAGES)) {
    const nodes = state.registry.forStage(stageName);
    lines.push(stageName + '  (' + STAGES[stageName].description + ')');
    if (!nodes.length) {
      lines.push('  (empty)');
    } else {
      nodes.forEach((node, index) => {
        const priority = Number.isFinite(node.priority) ? node.priority : 10;
        lines.push('  ' + (index + 1) + '. [' + priority + '] ' + node.name + '  <' + (node.origin || 'unknown') + '>');
      });
    }
    lines.push('');
  }

  if (state.issues.length) {
    lines.push('checks:');
    for (const issue of state.issues) {
      lines.push('  ' + issue.level.toUpperCase() + ': ' + issue.message);
    }
  } else {
    lines.push('checks: all clear');
  }

  return lines.join('\n');
}

function registerDoctorCommand(hexo) {
  if (!hexo.extend.console || typeof hexo.extend.console.register !== 'function') {
    return;
  }
  hexo.extend.console.register(
    'pipeline',
    'Inspect the text pipeline: node order per stage and config check results',
    {},
    function pipelineCommand() {
      const state = this._textPipeline;
      if (!state) {
        console.log('text-pipeline is disabled or not registered');
        return;
      }
      console.log(formatReport(state));
    }
  );
}

module.exports = { registerDoctorCommand, formatReport };
