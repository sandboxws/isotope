import type { ConstructNode } from './types.js';
import type { IsotopeConfig } from './config.js';
import type { EnvironmentConfig } from './environment.js';
import type { IsotopePlugin } from './plugin.js';
import { resolveEnvironment } from './environment.js';
import { resolvePlugins, EMPTY_PLUGIN_CHAIN } from './plugin-registry.js';
import { registerComponentKinds, resetComponentKinds } from './jsx-runtime.js';
import { rekindTree } from './tree-utils.js';

// ── IsotopeApp types ────────────────────────────────────────────────

export interface IsotopeAppProps {
  readonly name: string;
  readonly children?: ConstructNode | ConstructNode[];
}

export interface PipelineArtifact {
  readonly name: string;
  readonly tree: ConstructNode;
}

export interface AppSynthResult {
  readonly appName: string;
  readonly pipelines: readonly PipelineArtifact[];
}

// ── Configuration cascade ────────────────────────────────────────────

function applyConfigCascade(
  pipelineNode: ConstructNode,
  config?: IsotopeConfig,
  env?: EnvironmentConfig,
): ConstructNode {
  const pipelineName = pipelineNode.props.name as string;
  const mergedProps = { ...pipelineNode.props };

  if (config?.kubernetes?.namespace && mergedProps.namespace === undefined) {
    mergedProps.namespace = config.kubernetes.namespace;
  }

  if (env) {
    const envOverrides = resolveEnvironment(pipelineName, env);
    for (const [key, value] of Object.entries(envOverrides)) {
      if (mergedProps[key] === undefined) {
        mergedProps[key] = value;
      }
    }
  }

  return {
    ...pipelineNode,
    props: mergedProps,
  };
}

function propagateInfraToChildren(
  node: ConstructNode,
  config?: IsotopeConfig,
): ConstructNode {
  if (!config?.kafka?.bootstrapServers) return node;

  const bs = config.kafka.bootstrapServers;

  const propagate = (n: ConstructNode): ConstructNode => {
    let props = n.props;

    if (
      (n.kind === 'Source' || n.kind === 'Sink') &&
      (n.component === 'KafkaSource' || n.component === 'KafkaSink') &&
      props.bootstrapServers === undefined
    ) {
      props = { ...props, bootstrapServers: bs };
    }

    const children = n.children.map((c) => propagate(c));

    return { ...n, props, children };
  };

  return propagate(node);
}

// ── synthesizeApp ───────────────────────────────────────────────────

export function synthesizeApp(
  props: IsotopeAppProps,
  options?: {
    readonly env?: EnvironmentConfig;
    readonly config?: IsotopeConfig;
    readonly plugins?: readonly IsotopePlugin[];
  },
): AppSynthResult {
  const childArray = props.children == null
    ? []
    : Array.isArray(props.children)
      ? props.children
      : [props.children];

  const pipelineNodes = childArray.filter((c) => c.kind === 'Pipeline');

  const allPlugins = [
    ...(options?.config?.plugins ?? []),
    ...(options?.plugins ?? []),
  ];
  const chain = allPlugins.length > 0
    ? resolvePlugins(allPlugins)
    : EMPTY_PLUGIN_CHAIN;

  if (chain.components.size > 0) {
    registerComponentKinds(chain.components);
  }

  try {
    if (chain.beforeSynth.length > 0) {
      const hookCtx = {
        appName: props.name,
        pipelines: pipelineNodes,
      };
      for (const hook of chain.beforeSynth) {
        hook!(hookCtx);
      }
    }

    const pipelines: PipelineArtifact[] = pipelineNodes.map((pipelineNode) => {
      let node = applyConfigCascade(pipelineNode, options?.config, options?.env);
      node = propagateInfraToChildren(node, options?.config);

      if (chain.components.size > 0) {
        node = rekindTree(node, chain.components);
      }

      node = chain.transformTree(node);

      const name = node.props.name as string;

      return { name, tree: node };
    });

    if (chain.afterSynth.length > 0) {
      const hookCtx = {
        appName: props.name,
        pipelines: pipelineNodes,
        results: pipelines.map((p) => ({
          name: p.name,
          tree: p.tree,
        })),
      };
      for (const hook of chain.afterSynth) {
        hook!(hookCtx);
      }
    }

    return {
      appName: props.name,
      pipelines,
    };
  } finally {
    if (chain.components.size > 0) {
      resetComponentKinds();
    }
  }
}
