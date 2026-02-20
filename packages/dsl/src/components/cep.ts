import type { BaseComponentProps, ConstructNode } from '../core/types.js';
import { createElement } from '../core/jsx-runtime.js';

// ── MatchRecognize ──────────────────────────────────────────────────

export type MatchAfterStrategy = 'MATCH_RECOGNIZED' | 'NEXT_ROW';

export interface MatchRecognizeProps extends BaseComponentProps {
  readonly input: ConstructNode;
  readonly pattern: string;
  readonly define: Record<string, string>;
  readonly measures: Record<string, string>;
  readonly after?: MatchAfterStrategy;
  readonly partitionBy?: readonly string[];
  readonly orderBy?: string;
  readonly children?: ConstructNode | ConstructNode[];
}

export function MatchRecognize(props: MatchRecognizeProps): ConstructNode {
  const { input, children, ...rest } = props;

  if (!input) {
    throw new Error('MatchRecognize requires an input stream');
  }

  if (!props.pattern) {
    throw new Error('MatchRecognize requires a pattern');
  }

  if (!props.define || Object.keys(props.define).length === 0) {
    throw new Error('MatchRecognize requires at least one DEFINE clause');
  }

  if (!props.measures || Object.keys(props.measures).length === 0) {
    throw new Error('MatchRecognize requires at least one MEASURES expression');
  }

  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('MatchRecognize', { ...rest, input: input.id }, input, ...childArray);
}
