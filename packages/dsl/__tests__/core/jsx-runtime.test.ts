import { describe, it, expect, beforeEach } from 'vitest';
import {
  createElement,
  Fragment,
  jsx,
  jsxs,
  resetNodeIdCounter,
  toSqlIdentifier,
  registerComponentKinds,
  resetComponentKinds,
} from '../../src/core/jsx-runtime.js';

beforeEach(() => {
  resetNodeIdCounter();
  resetComponentKinds();
});

describe('toSqlIdentifier', () => {
  it('replaces hyphens and dots with underscores', () => {
    expect(toSqlIdentifier('my-topic.v1')).toBe('my_topic_v1');
  });

  it('removes invalid characters', () => {
    expect(toSqlIdentifier('hello@world!')).toBe('helloworld');
  });

  it('collapses multiple underscores', () => {
    expect(toSqlIdentifier('a--b..c')).toBe('a_b_c');
  });

  it('strips leading/trailing underscores', () => {
    expect(toSqlIdentifier('-foo-')).toBe('foo');
  });
});

describe('createElement', () => {
  it('creates a ConstructNode with auto-generated ID', () => {
    const node = createElement('Filter', { condition: 'x > 1' });

    expect(node.id).toBe('Filter_0');
    expect(node.kind).toBe('Transform');
    expect(node.component).toBe('Filter');
    expect(node.props.condition).toBe('x > 1');
    expect(node.children).toEqual([]);
  });

  it('uses _nameHint for ID', () => {
    const node = createElement('KafkaSource', { _nameHint: 'orders' });

    expect(node.id).toBe('orders');
    expect(node.props._nameHint).toBeUndefined();
  });

  it('deduplicates IDs', () => {
    const a = createElement('KafkaSource', { _nameHint: 'orders' });
    const b = createElement('KafkaSource', { _nameHint: 'orders' });

    expect(a.id).toBe('orders');
    expect(b.id).toBe('orders_2');
  });

  it('flattens children', () => {
    const child1 = createElement('Filter', { condition: 'a > 1' });
    const child2 = createElement('Filter', { condition: 'b > 2' });

    const parent = createElement('Pipeline', { name: 'test' }, child1, child2);

    expect(parent.children).toHaveLength(2);
    expect(parent.children[0].id).toBe(child1.id);
    expect(parent.children[1].id).toBe(child2.id);
  });

  it('handles null children', () => {
    const child = createElement('Filter', { condition: 'x > 1' });
    const parent = createElement('Pipeline', { name: 'test' }, null, child, undefined);

    expect(parent.children).toHaveLength(1);
  });

  it('resolves kind for known components', () => {
    expect(createElement('KafkaSource', {}).kind).toBe('Source');
    expect(createElement('KafkaSink', {}).kind).toBe('Sink');
    expect(createElement('Filter', {}).kind).toBe('Transform');
    expect(createElement('Join', {}).kind).toBe('Join');
    expect(createElement('TumbleWindow', {}).kind).toBe('Window');
    expect(createElement('Pipeline', {}).kind).toBe('Pipeline');
    expect(createElement('GeneratorSource', {}).kind).toBe('Source');
    expect(createElement('ConsoleSink', {}).kind).toBe('Sink');
    expect(createElement('MatchRecognize', {}).kind).toBe('CEP');
    expect(createElement('RawSQL', {}).kind).toBe('RawSQL');
  });

  it('defaults to Transform for unknown components', () => {
    expect(createElement('CustomThing', {}).kind).toBe('Transform');
  });

  it('delegates to function components', () => {
    function MyComponent(props: { value: number; children?: unknown[] }): any {
      return createElement('Filter', { condition: `x > ${props.value}` });
    }

    const node = createElement(MyComponent, { value: 42 });
    expect(node.component).toBe('Filter');
    expect(node.props.condition).toBe('x > 42');
  });

  it('strips children from props', () => {
    const child = createElement('Filter', { condition: 'x > 1' });
    const parent = createElement('Pipeline', { name: 'test', children: [child] } as any, child);

    expect(parent.props.children).toBeUndefined();
  });
});

describe('Fragment', () => {
  it('returns children as-is', () => {
    const children = [
      createElement('Filter', { condition: 'a > 1' }),
      createElement('Filter', { condition: 'b > 2' }),
    ];

    const result = Fragment({ children });
    expect(result).toEqual(children);
  });

  it('returns empty array without children', () => {
    expect(Fragment({})).toEqual([]);
  });
});

describe('jsx / jsxs', () => {
  it('jsx creates node with single child', () => {
    const child = createElement('Filter', { condition: 'x > 1' });
    const node = jsx('Pipeline', { name: 'test', children: child });

    expect(node.component).toBe('Pipeline');
    expect(node.children).toHaveLength(1);
  });

  it('jsxs creates node with multiple children', () => {
    const children = [
      createElement('Filter', { condition: 'a > 1' }),
      createElement('Filter', { condition: 'b > 2' }),
    ];
    const node = jsxs('Pipeline', { name: 'test', children });

    expect(node.component).toBe('Pipeline');
    expect(node.children).toHaveLength(2);
  });
});

describe('registerComponentKinds / resetComponentKinds', () => {
  it('registers and resolves custom component kinds', () => {
    registerComponentKinds(new globalThis.Map([['MyCustomOp', 'Transform']]));

    const node = createElement('MyCustomOp', { value: 1 });
    expect(node.kind).toBe('Transform');

    resetComponentKinds();
  });

  it('resets to builtin kinds', () => {
    registerComponentKinds(new globalThis.Map([['MyCustomOp', 'Source']]));
    resetComponentKinds();

    const node = createElement('MyCustomOp', { value: 1 });
    // Falls back to Transform (default for unknown)
    expect(node.kind).toBe('Transform');
  });
});
