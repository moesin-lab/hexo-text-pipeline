'use strict';

/**
 * 默认样式，经 hexo injector 注入 head_end；text_pipeline.inject_css: false 可关闭，
 * 关闭后结构类名（callout / callout-title / callout-content / data-callout）由主题自行接管。
 */
module.exports = `
.callout{--callout-color:68,138,255;border-left:4px solid rgb(var(--callout-color));border-radius:4px;padding:.75rem 1rem;margin:1rem 0;background:rgba(var(--callout-color),.08)}
.callout-title{font-weight:600;color:rgb(var(--callout-color));margin:0 0 .25rem}
.callout-content>:first-child{margin-top:.25rem}
.callout-content>:last-child{margin-bottom:0}
details.callout>summary.callout-title{cursor:pointer}
.callout[data-callout=tip],.callout[data-callout=hint],.callout[data-callout=important]{--callout-color:0,191,188}
.callout[data-callout=success],.callout[data-callout=check],.callout[data-callout=done]{--callout-color:68,207,110}
.callout[data-callout=question],.callout[data-callout=help],.callout[data-callout=faq]{--callout-color:233,196,106}
.callout[data-callout=warning],.callout[data-callout=caution],.callout[data-callout=attention]{--callout-color:236,117,0}
.callout[data-callout=danger],.callout[data-callout=error],.callout[data-callout=failure],.callout[data-callout=fail],.callout[data-callout=missing],.callout[data-callout=bug]{--callout-color:233,49,71}
.callout[data-callout=example]{--callout-color:168,130,255}
.callout[data-callout=quote],.callout[data-callout=cite],.callout[data-callout=diary]{--callout-color:158,158,158}
`.trim();
