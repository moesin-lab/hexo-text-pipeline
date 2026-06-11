'use strict';

function createHexoMock(options = {}) {
  const posts = options.posts || [];
  const config = options.config || {};

  let postsGetCount = 0;
  const handlers = new Map();
  const injected = [];
  const consoleCommands = new Map();
  const warnings = [];

  const hexo = {
    config,
    base_dir: options.baseDir,
    locals: {
      get(name) {
        if (name === 'posts') {
          postsGetCount += 1;
          return {
            toArray() {
              return posts;
            }
          };
        }
        return null;
      }
    },
    extend: {
      filter: {
        // 真 hexo 同一 filter 名可挂多个；这里组合成一个顺序调用的函数，返回最后一个的返回值
        register(name, fn) {
          const prev = handlers.get(name);
          if (!prev) {
            handlers.set(name, fn);
            return;
          }
          const list = prev._list || [prev];
          list.push(fn);
          const composite = (...args) => {
            let result;
            for (const handler of list) {
              result = handler(...args);
            }
            return result;
          };
          composite._list = list;
          handlers.set(name, composite);
        }
      },
      injector: {
        register(entry, value) {
          injected.push({ entry, value });
        }
      },
      console: {
        register(name, desc, opts, fn) {
          consoleCommands.set(name, fn);
        }
      }
    },
    log: {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    }
  };

  return {
    hexo,
    handlers,
    injected,
    consoleCommands,
    warnings,
    getPostsGetCount() {
      return postsGetCount;
    }
  };
}

module.exports = { createHexoMock };
