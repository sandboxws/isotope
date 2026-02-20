import { Command } from 'commander';
import pc from 'picocolors';
import { readFileSync, existsSync } from 'node:fs';
import { SynthContext } from '@isotope/dsl';
import type { ConstructNode, GraphEdge } from '@isotope/dsl';

// ── Command registration ────────────────────────────────────────────

export function registerInspectCommand(program: Command): void {
  program
    .command('inspect')
    .argument('<plan-file>', 'Path to plan file (plan.json or plan.pb)')
    .description('Inspect a compiled execution plan')
    .option('--json', 'Output as JSON')
    .option('--graph', 'Output as Mermaid DAG')
    .action(async (planFile: string, opts: { json?: boolean; graph?: boolean }) => {
      await runInspect(planFile, opts);
    });
}

// ── Inspect logic ───────────────────────────────────────────────────

export async function runInspect(
  planFile: string,
  opts: { json?: boolean; graph?: boolean },
): Promise<string> {
  if (!existsSync(planFile)) {
    console.error(pc.red(`Error: Plan file not found: ${planFile}`));
    process.exitCode = 1;
    return '';
  }

  const tree = loadPlan(planFile);

  if (!tree) {
    console.error(pc.red('Error: Failed to load plan file.'));
    process.exitCode = 1;
    return '';
  }

  const ctx = new SynthContext();
  ctx.buildFromTree(tree);

  const nodes = ctx.getAllNodes();
  const edges = ctx.getAllEdges();

  let output: string;

  if (opts.json) {
    output = formatJson(tree, nodes, edges);
  } else if (opts.graph) {
    output = formatMermaid(tree, nodes, edges);
  } else {
    output = formatTable(tree, nodes, edges);
  }

  console.log(output);
  return output;
}

// ── Plan loading ────────────────────────────────────────────────────

function loadPlan(planFile: string): ConstructNode | null {
  try {
    if (planFile.endsWith('.json')) {
      const content = readFileSync(planFile, 'utf-8');
      return JSON.parse(content) as ConstructNode;
    }

    if (planFile.endsWith('.pb')) {
      // TODO: Implement Protobuf deserialization when plan-compiler is available
      console.error(pc.yellow('Protobuf plan files (.pb) are not yet supported.'));
      console.error(pc.dim('Use plan.json files from `isotope synth` output.'));
      return null;
    }

    console.error(pc.red(`Unsupported plan file format: ${planFile}`));
    console.error(pc.dim('Supported formats: .json, .pb'));
    return null;
  } catch (err) {
    console.error(pc.red(`Error reading plan file: ${(err as Error).message}`));
    return null;
  }
}

// ── Table format ────────────────────────────────────────────────────

function formatTable(
  tree: ConstructNode,
  nodes: readonly ConstructNode[],
  edges: readonly GraphEdge[],
): string {
  const lines: string[] = [];
  const pipelineName = (tree.props.name as string) ?? tree.id;
  const mode = (tree.props.mode as string) ?? 'streaming';

  lines.push('');
  lines.push(`${pc.bold('Pipeline:')} ${pc.cyan(pipelineName)}`);
  lines.push(`${pc.bold('Mode:')}     ${mode}`);
  lines.push('');

  // Operators table
  lines.push(pc.bold('Operators'));
  lines.push(pc.dim('─'.repeat(70)));
  lines.push(
    `  ${pad('ID', 12)} ${pad('Type', 12)} ${pad('Component', 18)} ${pad('Parallelism', 12)} ${pad('Name', 14)}`,
  );
  lines.push(pc.dim('─'.repeat(70)));

  for (const node of nodes) {
    const parallelism = (node.props.parallelism as number) ?? '-';
    const name = (node.props.name as string) ?? '-';
    lines.push(
      `  ${pad(node.id, 12)} ${pad(node.kind, 12)} ${pad(node.component, 18)} ${pad(String(parallelism), 12)} ${pad(name, 14)}`,
    );
  }

  lines.push('');

  // Edges
  if (edges.length > 0) {
    lines.push(pc.bold('Edges'));
    lines.push(pc.dim('─'.repeat(40)));
    for (const edge of edges) {
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      const fromLabel = fromNode?.component ?? edge.from;
      const toLabel = toNode?.component ?? edge.to;
      lines.push(`  ${fromLabel} ${pc.dim('→')} ${toLabel}`);
    }
    lines.push('');
  }

  // Schemas
  const nodesWithSchemas = nodes.filter((n) => n.props.schema != null);
  if (nodesWithSchemas.length > 0) {
    lines.push(pc.bold('Schemas'));
    lines.push(pc.dim('─'.repeat(40)));
    for (const node of nodesWithSchemas) {
      const schema = node.props.schema as Record<string, unknown>;
      lines.push(`  ${pc.cyan(node.component)} (${node.id})`);
      if (schema && typeof schema === 'object' && 'fields' in schema) {
        const fields = schema.fields as Record<string, { type: string }>;
        for (const [fieldName, fieldDef] of Object.entries(fields)) {
          lines.push(`    ${fieldName}: ${pc.dim(fieldDef.type ?? String(fieldDef))}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── JSON format ─────────────────────────────────────────────────────

function formatJson(
  tree: ConstructNode,
  nodes: readonly ConstructNode[],
  edges: readonly GraphEdge[],
): string {
  const output = {
    pipeline: {
      name: (tree.props.name as string) ?? tree.id,
      mode: (tree.props.mode as string) ?? 'streaming',
    },
    operators: nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      component: n.component,
      parallelism: (n.props.parallelism as number) ?? null,
      props: n.props,
    })),
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
    })),
  };

  return JSON.stringify(output, null, 2);
}

// ── Mermaid format ──────────────────────────────────────────────────

function formatMermaid(
  tree: ConstructNode,
  nodes: readonly ConstructNode[],
  edges: readonly GraphEdge[],
): string {
  const pipelineName = (tree.props.name as string) ?? tree.id;
  const lines: string[] = [];

  lines.push(`---`);
  lines.push(`title: ${pipelineName}`);
  lines.push(`---`);
  lines.push('graph TD');

  // Kind → style class mapping
  const kindStyles: Record<string, string> = {
    Source: ':::source',
    Transform: ':::transform',
    Join: ':::join',
    Window: ':::window',
    Sink: ':::sink',
    Pipeline: ':::pipeline',
  };

  for (const node of nodes) {
    const label = `${node.kind}: ${node.component}`;
    const style = kindStyles[node.kind] ?? '';
    lines.push(`  ${sanitizeId(node.id)}["${label}"]${style}`);
  }

  lines.push('');

  for (const edge of edges) {
    lines.push(`  ${sanitizeId(edge.from)} --> ${sanitizeId(edge.to)}`);
  }

  lines.push('');
  lines.push('  classDef source fill:#4CAF50,color:#fff');
  lines.push('  classDef transform fill:#2196F3,color:#fff');
  lines.push('  classDef join fill:#FF9800,color:#fff');
  lines.push('  classDef window fill:#9C27B0,color:#fff');
  lines.push('  classDef sink fill:#F44336,color:#fff');
  lines.push('  classDef pipeline fill:#9E9E9E,color:#fff');

  return lines.join('\n');
}

// ── Utilities ───────────────────────────────────────────────────────

function pad(str: string, width: number): string {
  return str.padEnd(width);
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}
