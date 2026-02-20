import { describe, it, expect, beforeEach } from 'vitest';
import { createElement, resetNodeIdCounter } from '../../src/core/jsx-runtime.js';
import { mapTree, walkTree, findNodes, wrapNode, replaceChild, rekindTree } from '../../src/core/tree-utils.js';

beforeEach(() => {
  resetNodeIdCounter();
});

function makeTree() {
  const filter = createElement('Filter', { condition: 'x > 1' });
  const sink = createElement('KafkaSink', { topic: 'out', bootstrapServers: 'kafka:9092' });
  const source = createElement('KafkaSource', {
    topic: 'in',
    bootstrapServers: 'kafka:9092',
    schema: { fields: {} },
  }, filter, sink);
  const pipeline = createElement('Pipeline', { name: 'test' }, source);
  return { pipeline, source, filter, sink };
}

describe('mapTree', () => {
  it('applies visitor to all nodes post-order', () => {
    const { pipeline } = makeTree();
    const visited: string[] = [];

    mapTree(pipeline, (node) => {
      visited.push(node.component);
      return node;
    });

    // Post-order: deepest first
    expect(visited).toEqual(['Filter', 'KafkaSink', 'KafkaSource', 'Pipeline']);
  });

  it('returns same reference when visitor is identity', () => {
    const { pipeline } = makeTree();
    const result = mapTree(pipeline, (n) => n);
    expect(result).toBe(pipeline);
  });

  it('creates new tree when visitor modifies a node', () => {
    const { pipeline } = makeTree();
    const result = mapTree(pipeline, (node) => {
      if (node.component === 'Filter') {
        return { ...node, props: { ...node.props, condition: 'x > 100' } };
      }
      return node;
    });

    expect(result).not.toBe(pipeline);
    const filterNode = findNodes(result, (n) => n.component === 'Filter')[0];
    expect(filterNode.props.condition).toBe('x > 100');
  });
});

describe('walkTree', () => {
  it('visits nodes in pre-order', () => {
    const { pipeline } = makeTree();
    const visited: string[] = [];

    walkTree(pipeline, (node) => {
      visited.push(node.component);
    });

    expect(visited).toEqual(['Pipeline', 'KafkaSource', 'Filter', 'KafkaSink']);
  });

  it('skips children when callback returns false', () => {
    const { pipeline } = makeTree();
    const visited: string[] = [];

    walkTree(pipeline, (node) => {
      visited.push(node.component);
      if (node.component === 'KafkaSource') return false;
    });

    expect(visited).toEqual(['Pipeline', 'KafkaSource']);
  });
});

describe('findNodes', () => {
  it('finds nodes matching predicate', () => {
    const { pipeline } = makeTree();
    const sources = findNodes(pipeline, (n) => n.kind === 'Source');

    expect(sources).toHaveLength(1);
    expect(sources[0].component).toBe('KafkaSource');
  });

  it('returns empty array when no match', () => {
    const { pipeline } = makeTree();
    const result = findNodes(pipeline, (n) => n.component === 'NonExistent');
    expect(result).toEqual([]);
  });
});

describe('wrapNode', () => {
  it('wraps a target node with a wrapper', () => {
    const { pipeline, filter } = makeTree();
    const wrapper = {
      id: 'wrapper_1',
      kind: 'Transform' as const,
      component: 'Wrapper',
      props: {},
    };

    const result = wrapNode(pipeline, filter.id, wrapper);
    const wrapperNode = findNodes(result, (n) => n.component === 'Wrapper')[0];

    expect(wrapperNode).toBeDefined();
    expect(wrapperNode.children).toHaveLength(1);
    expect(wrapperNode.children[0].component).toBe('Filter');
  });
});

describe('replaceChild', () => {
  it('replaces a child node', () => {
    const { pipeline, filter } = makeTree();
    const replacement = createElement('Map', { select: { x: 'x * 2' } });

    const result = replaceChild(pipeline, filter.id, replacement);
    const mapNodes = findNodes(result, (n) => n.component === 'Map');
    const filterNodes = findNodes(result, (n) => n.component === 'Filter');

    expect(mapNodes).toHaveLength(1);
    expect(filterNodes).toHaveLength(0);
  });
});

describe('rekindTree', () => {
  it('updates node kinds from a kind map', () => {
    const { pipeline } = makeTree();
    const newKindMap = new Map([['Filter', 'Source' as const]]);

    const result = rekindTree(pipeline, newKindMap);
    const filterNode = findNodes(result, (n) => n.component === 'Filter')[0];

    expect(filterNode.kind).toBe('Source');
  });

  it('preserves original tree when no changes needed', () => {
    const { pipeline } = makeTree();
    const emptyMap = new Map();

    const result = rekindTree(pipeline, emptyMap);
    expect(result).toBe(pipeline);
  });
});
