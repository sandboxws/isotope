import { describe, it, expect } from 'vitest';
import { resolvePlugins, EMPTY_PLUGIN_CHAIN } from '../../src/core/plugin-registry.js';
import type { IsotopePlugin } from '../../src/core/plugin.js';

describe('EMPTY_PLUGIN_CHAIN', () => {
  it('has identity tree transformer', () => {
    const tree = { id: 'a', kind: 'Transform' as const, component: 'X', props: {}, children: [] };
    expect(EMPTY_PLUGIN_CHAIN.transformTree(tree)).toBe(tree);
  });

  it('has empty collections', () => {
    expect(EMPTY_PLUGIN_CHAIN.order).toEqual([]);
    expect(EMPTY_PLUGIN_CHAIN.components.size).toBe(0);
    expect(EMPTY_PLUGIN_CHAIN.planTransformers.size).toBe(0);
    expect(EMPTY_PLUGIN_CHAIN.validators).toEqual([]);
  });
});

describe('resolvePlugins', () => {
  it('returns EMPTY_PLUGIN_CHAIN for empty array', () => {
    expect(resolvePlugins([])).toBe(EMPTY_PLUGIN_CHAIN);
  });

  it('resolves a single plugin', () => {
    const plugin: IsotopePlugin = {
      name: 'test-plugin',
      components: new Map([['MyOp', 'Transform']]),
    };

    const chain = resolvePlugins([plugin]);
    expect(chain.order).toEqual(['test-plugin']);
    expect(chain.components.get('MyOp')).toBe('Transform');
  });

  it('throws on duplicate plugin names', () => {
    const a: IsotopePlugin = { name: 'dup' };
    const b: IsotopePlugin = { name: 'dup' };

    expect(() => resolvePlugins([a, b])).toThrow("Duplicate plugin name 'dup'");
  });

  it('orders plugins by before/after constraints', () => {
    const a: IsotopePlugin = {
      name: 'alpha',
      ordering: { before: ['beta'] },
    };
    const b: IsotopePlugin = { name: 'beta' };

    const chain = resolvePlugins([b, a]);
    expect(chain.order).toEqual(['alpha', 'beta']);
  });

  it('orders plugins with after constraints', () => {
    const a: IsotopePlugin = { name: 'alpha' };
    const b: IsotopePlugin = {
      name: 'beta',
      ordering: { after: ['alpha'] },
    };

    const chain = resolvePlugins([b, a]);
    expect(chain.order).toEqual(['alpha', 'beta']);
  });

  it('throws on circular ordering', () => {
    const a: IsotopePlugin = {
      name: 'alpha',
      ordering: { before: ['beta'] },
    };
    const b: IsotopePlugin = {
      name: 'beta',
      ordering: { before: ['alpha'] },
    };

    expect(() => resolvePlugins([a, b])).toThrow('Circular ordering constraint');
  });

  it('composes tree transformers left-to-right', () => {
    const a: IsotopePlugin = {
      name: 'add-tag-a',
      transformTree: (tree) => ({ ...tree, props: { ...tree.props, tagA: true } }),
    };
    const b: IsotopePlugin = {
      name: 'add-tag-b',
      transformTree: (tree) => ({ ...tree, props: { ...tree.props, tagB: true } }),
    };

    const chain = resolvePlugins([a, b]);
    const tree = { id: 'x', kind: 'Transform' as const, component: 'X', props: {}, children: [] };
    const result = chain.transformTree(tree);

    expect(result.props.tagA).toBe(true);
    expect(result.props.tagB).toBe(true);
  });

  it('detects conflicting component registrations', () => {
    const a: IsotopePlugin = {
      name: 'alpha',
      components: new Map([['MyOp', 'Transform']]),
    };
    const b: IsotopePlugin = {
      name: 'beta',
      components: new Map([['MyOp', 'Source']]),
    };

    expect(() => resolvePlugins([a, b])).toThrow(
      "Component 'MyOp' registered by both 'alpha' and 'beta'",
    );
  });

  it('collects validators in order', () => {
    const v1 = () => [];
    const v2 = () => [];

    const a: IsotopePlugin = { name: 'alpha', validate: v1 };
    const b: IsotopePlugin = { name: 'beta', validate: v2 };

    const chain = resolvePlugins([a, b]);
    expect(chain.validators).toEqual([v1, v2]);
  });
});
