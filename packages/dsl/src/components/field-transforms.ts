import type { FieldDefinition, BaseComponentProps, ConstructNode } from '../core/types.js';
import { createElement } from '../core/jsx-runtime.js';

// ── Rename ─────────────────────────────────────────────────────────

export interface RenameProps extends BaseComponentProps {
  readonly columns: Record<string, string>;
  readonly children?: ConstructNode | ConstructNode[];
}

export function Rename(props: RenameProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Rename', { ...rest }, ...childArray);
}

// ── Drop ───────────────────────────────────────────────────────────

export interface DropProps extends BaseComponentProps {
  readonly columns: readonly string[];
  readonly children?: ConstructNode | ConstructNode[];
}

export function Drop(props: DropProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Drop', { ...rest }, ...childArray);
}

// ── Cast ───────────────────────────────────────────────────────────

export interface CastProps extends BaseComponentProps {
  readonly columns: Record<string, FieldDefinition>;
  readonly children?: ConstructNode | ConstructNode[];
}

export function Cast(props: CastProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Cast', { ...rest }, ...childArray);
}

// ── Coalesce ───────────────────────────────────────────────────────

export interface CoalesceProps extends BaseComponentProps {
  readonly columns: Record<string, string>;
  readonly children?: ConstructNode | ConstructNode[];
}

export function Coalesce(props: CoalesceProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('Coalesce', { ...rest }, ...childArray);
}

// ── AddField ───────────────────────────────────────────────────────

export interface AddFieldProps extends BaseComponentProps {
  readonly columns: Record<string, string>;
  readonly types?: Record<string, FieldDefinition>;
  readonly children?: ConstructNode | ConstructNode[];
}

export function AddField(props: AddFieldProps): ConstructNode {
  const { children, ...rest } = props;
  const childArray = children == null
    ? []
    : Array.isArray(children)
      ? children
      : [children];

  return createElement('AddField', { ...rest }, ...childArray);
}
