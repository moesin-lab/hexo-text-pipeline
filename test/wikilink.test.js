'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const plugin = require('../index');
const wikilink = require('../lib/converters/wikilink');
const { replaceOutsideCode } = require('../lib/core/markdown-guard');
const { createHexoMock } = require('./helpers/mock-hexo');

test('converts wiki links to abbrlink permalink with optional domain prefix', () => {
  const ctx = createHexoMock({
    config: { obsidian_compiler: { domain_prefix: 'https://example.com/blog/' } },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  plugin(ctx.hexo);
  ctx.handlers.get('before_generate')();

  const result = ctx.handlers.get('before_post_render')({
    content: '[[Hello Hexo]] [[Hello Hexo|Click]] [[hello-hexo#Section A]] [[Missing]]'
  }).content;

  assert.equal(
    result,
    '[Hello Hexo](https://example.com/blog/posts/abcd1234) [Click](https://example.com/blog/posts/abcd1234) [hello-hexo](https://example.com/blog/posts/abcd1234#Section%20A) [[Missing]]'
  );
});

test('does not replace wiki links inside fenced code and inline code', () => {
  const index = {
    byTitle: new Map([['hello hexo', { abbrlink: 'abcd1234' }]]),
    bySlug: new Map(),
    bySourcePath: new Map(),
    bySourceBase: new Map()
  };
  const replacer = wikilink._internal.createWikiLinkReplacer(index, '');

  const input = [
    'normal [[Hello Hexo]]',
    '`inline [[Hello Hexo]]`',
    '```md',
    '[[Hello Hexo]]',
    '```',
    'tail [[Hello Hexo|Alias]]'
  ].join('\n');

  assert.equal(
    replaceOutsideCode(input, replacer),
    [
      'normal [Hello Hexo](/posts/abcd1234)',
      '`inline [[Hello Hexo]]`',
      '```md',
      '[[Hello Hexo]]',
      '```',
      'tail [Alias](/posts/abcd1234)'
    ].join('\n')
  );
});

test('matches obsidian links containing folder path and markdown extension', () => {
  const ctx = createHexoMock({
    config: { obsidian_compiler: {} },
    posts: [
      {
        title: '记一次个人博客安装配置',
        slug: 'blog-setup',
        source: '_posts/经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md',
        abbrlink: 'k3h1d8'
      }
    ]
  });

  plugin(ctx.hexo);
  ctx.handlers.get('before_generate')();

  const result = ctx.handlers.get('before_post_render')({
    content: '[[经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md]]'
  }).content;

  assert.equal(result, '[经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md](/posts/k3h1d8)');
});

test('builds index once per generate cycle and reuses cache during rendering', () => {
  const ctx = createHexoMock({
    config: { obsidian_compiler: {} },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  plugin(ctx.hexo);
  const beforePostRender = ctx.handlers.get('before_post_render');

  ctx.handlers.get('before_generate')();
  beforePostRender({ content: '[[Hello Hexo]]' });
  beforePostRender({ content: '[[hello-hexo]]' });

  assert.equal(ctx.getPostsGetCount(), 1);
});

test('falls back to post.path when frontmatter has no abbrlink', () => {
  const ctx = createHexoMock({
    config: { obsidian_compiler: {} },
    posts: [
      { title: 'No Abbr', slug: 'no-abbr', path: '2026/06/11/no-abbr/' },
      { title: 'Nothing At All', slug: 'nothing' }
    ]
  });

  plugin(ctx.hexo);
  ctx.handlers.get('before_generate')();

  const result = ctx.handlers.get('before_post_render')({
    content: '[[No Abbr]] [[Nothing At All]]'
  }).content;

  assert.equal(result, '[No Abbr](/2026/06/11/no-abbr) [[Nothing At All]]');
});

test('rebuilds index when cached index is empty', () => {
  const posts = [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }];
  const ctx = createHexoMock({
    config: { obsidian_compiler: {} },
    posts: []
  });

  plugin(ctx.hexo);
  ctx.handlers.get('before_generate')();

  ctx.hexo.locals.get = function get(name) {
    if (name === 'posts') {
      return {
        toArray() {
          return posts;
        }
      };
    }
    return null;
  };

  const result = ctx.handlers.get('before_post_render')({ content: '[[Hello Hexo]]' }).content;
  assert.equal(result, '[Hello Hexo](/posts/abcd1234)');
});
