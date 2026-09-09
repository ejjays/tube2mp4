/**
 * @fileoverview custom rules
 */

const phantomPlugin = {
  rules: {
    'no-raw-fetch': {
      meta: {
        type: 'problem',
        docs: { description: 'Force use of secureFetch instead of raw fetch' },
        messages: {
          useSecureFetch:
            'Raw fetch() is forbidden for security (SSRF). Use secureFetch() from src/utils/network/security.util.ts',
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee.name === 'fetch') {
              const filename = context.filename || context.getFilename();
              if (filename.includes('security.util.ts')) return;
              if (filename.includes('tests/')) return;
              context.report({ node, messageId: 'useSecureFetch' });
            }
          },
        };
      },
    },
    'no-raw-spawn': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Force use of service wrappers instead of raw spawn',
        },
        messages: {
          useService:
            'Raw spawn() is forbidden. Use ytdlp.service.ts or other service-layer wrappers for process management.',
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee.name === 'spawn') {
              const filename = context.filename || context.getFilename();
              if (filename.includes('ytdlp.service.ts')) return;
              if (filename.includes('services/ytdlp/')) return;
              if (filename.includes('utils/media/video.util.ts')) return;
              if (filename.includes('extractors/bluesky.ts')) return;
              if (filename.includes('extractors/soundcloud.ts')) return;
              if (filename.includes('extractors/vimeo.ts')) return;
              if (filename.includes('tests/')) return;
              context.report({ node, messageId: 'useService' });
            }
          },
        };
      },
    },
    'phantom-comments': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Comment style (disabled)' },
        messages: {},
      },
      create() {
        return {};
      },
    },
    'no-inline-svg': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Keep SVG in canonical icon files, not inlined in components',
        },
        messages: {
          useIconFile:
            "Inline <svg> detected. Icons belong in a dedicated icon module (mobile: components/icons.tsx or FormatIcons.tsx; app: assets/icons/*) — don't hardcode raw SVG in feature components.",
        },
      },
      create(context) {
        const filename = context.filename || context.getFilename();
        const EXEMPT = [
          'components/icons.tsx',
          'FormatIcons.tsx',
          'DotBackground.tsx',
          'GlowBlob.tsx',
          'VinylGrooves.tsx',
          'assets/icons/',
          'tests/',
        ];
        if (EXEMPT.some((part) => filename.includes(part))) return {};
        return {
          JSXOpeningElement(node) {
            const name = node.name && node.name.name;
            if (name === 'svg' || name === 'Svg') {
              context.report({ node, messageId: 'useIconFile' });
            }
          },
        };
      },
    },
  },
};

export default phantomPlugin;
