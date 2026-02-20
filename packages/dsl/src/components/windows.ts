import type { BaseComponentProps, ConstructNode } from '../core/types.js';
import { createElement } from '../core/jsx-runtime.js';

// ── TumbleWindow ────────────────────────────────────────────────────

export interface TumbleWindowProps extends BaseComponentProps {
  readonly size: string;
  readonly on: string;
  readonly children?: ConstructNode | ConstructNode[];
}

export function TumbleWindow(props: TumbleWindowProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('TumbleWindow', { ...rest }, ...childArray);
}

// ── SlideWindow ─────────────────────────────────────────────────────

export interface SlideWindowProps extends BaseComponentProps {
  readonly size: string;
  readonly slide: string;
  readonly on: string;
  readonly children?: ConstructNode | ConstructNode[];
}

export function SlideWindow(props: SlideWindowProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('SlideWindow', { ...rest }, ...childArray);
}

// ── SessionWindow ───────────────────────────────────────────────────

export interface SessionWindowProps extends BaseComponentProps {
  readonly gap: string;
  readonly on: string;
  readonly children?: ConstructNode | ConstructNode[];
}

export function SessionWindow(props: SessionWindowProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('SessionWindow', { ...rest }, ...childArray);
}
