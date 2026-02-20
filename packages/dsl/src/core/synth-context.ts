import type { ConstructNode, NodeKind } from './types.js';
import type { PluginValidator } from './plugin.js';

// ── Graph types ──────────────────────────────────────────────────────

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface ValidationDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly nodeId?: string;
  readonly component?: string;
}

// ── SynthContext ──────────────────────────────────────────────────────

export class SynthContext {
  private readonly nodes: Map<string, ConstructNode> = new Map();
  private readonly adjacency: Map<string, Set<string>> = new Map();
  private readonly reverseAdj: Map<string, Set<string>> = new Map();

  addNode(node: ConstructNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, new Set());
    }
    if (!this.reverseAdj.has(node.id)) {
      this.reverseAdj.set(node.id, new Set());
    }
  }

  addEdge(from: string, to: string): void {
    if (!this.adjacency.has(from)) {
      this.adjacency.set(from, new Set());
    }
    this.adjacency.get(from)!.add(to);

    if (!this.reverseAdj.has(to)) {
      this.reverseAdj.set(to, new Set());
    }
    this.reverseAdj.get(to)!.add(from);
  }

  getNode(id: string): ConstructNode | undefined {
    return this.nodes.get(id);
  }

  getOutgoing(id: string): ReadonlySet<string> {
    return this.adjacency.get(id) ?? new Set();
  }

  getIncoming(id: string): ReadonlySet<string> {
    return this.reverseAdj.get(id) ?? new Set();
  }

  getNodesByKind(...kinds: NodeKind[]): ConstructNode[] {
    const kindSet = new Set(kinds);
    const result: ConstructNode[] = [];
    for (const node of this.nodes.values()) {
      if (kindSet.has(node.kind)) {
        result.push(node);
      }
    }
    return result;
  }

  getAllNodes(): ConstructNode[] {
    return [...this.nodes.values()];
  }

  getAllEdges(): GraphEdge[] {
    const edges: GraphEdge[] = [];
    for (const [from, tos] of this.adjacency) {
      for (const to of tos) {
        edges.push({ from, to });
      }
    }
    return edges;
  }

  // ── Build from construct tree ────────────────────────────────────

  buildFromTree(root: ConstructNode): void {
    this.addNode(root);
    for (const child of root.children) {
      this.addNode(child);
      this.addEdge(root.id, child.id);
      this.buildFromTree(child);
    }
  }

  // ── Topological sort ─────────────────────────────────────────────

  topologicalSort(): ConstructNode[] {
    const inDegree = new Map<string, number>();
    for (const id of this.nodes.keys()) {
      inDegree.set(id, 0);
    }
    for (const [, tos] of this.adjacency) {
      for (const to of tos) {
        inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: ConstructNode[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = this.nodes.get(id);
      if (node) sorted.push(node);

      for (const neighbor of this.adjacency.get(id) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    if (sorted.length !== this.nodes.size) {
      throw new Error('Cycle detected in pipeline graph');
    }

    return sorted;
  }

  // ── Validation ───────────────────────────────────────────────────

  detectOrphanSources(): ValidationDiagnostic[] {
    const diagnostics: ValidationDiagnostic[] = [];
    for (const node of this.nodes.values()) {
      if (node.kind === 'Source') {
        const outgoing = this.adjacency.get(node.id);
        if (!outgoing || outgoing.size === 0) {
          diagnostics.push({
            severity: 'error',
            message: `Orphan source '${node.component}' (${node.id}): declared but never consumed`,
            nodeId: node.id,
            component: node.component,
          });
        }
      }
    }
    return diagnostics;
  }

  detectDanglingSinks(): ValidationDiagnostic[] {
    const diagnostics: ValidationDiagnostic[] = [];
    for (const node of this.nodes.values()) {
      if (node.kind === 'Sink') {
        const incoming = this.reverseAdj.get(node.id);
        if (!incoming || incoming.size === 0) {
          diagnostics.push({
            severity: 'error',
            message: `Dangling sink '${node.component}' (${node.id}): no input path`,
            nodeId: node.id,
            component: node.component,
          });
        }
      }
    }
    return diagnostics;
  }

  detectCycles(): ValidationDiagnostic[] {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const id of this.nodes.keys()) {
      color.set(id, WHITE);
    }

    const cycleNodes: string[] = [];

    const dfs = (id: string): boolean => {
      color.set(id, GRAY);
      for (const neighbor of this.adjacency.get(id) ?? []) {
        if (color.get(neighbor) === GRAY) {
          cycleNodes.push(neighbor);
          return true;
        }
        if (color.get(neighbor) === WHITE && dfs(neighbor)) {
          return true;
        }
      }
      color.set(id, BLACK);
      return false;
    };

    for (const id of this.nodes.keys()) {
      if (color.get(id) === WHITE) {
        if (dfs(id)) break;
      }
    }

    if (cycleNodes.length > 0) {
      const node = this.nodes.get(cycleNodes[0]);
      return [{
        severity: 'error',
        message: `Cycle detected involving node '${node?.component ?? cycleNodes[0]}' (${cycleNodes[0]})`,
        nodeId: cycleNodes[0],
        component: node?.component,
      }];
    }

    return [];
  }

  validate(
    root?: ConstructNode,
    pluginValidators?: readonly PluginValidator[],
  ): ValidationDiagnostic[] {
    const builtIn = [
      ...this.detectOrphanSources(),
      ...this.detectDanglingSinks(),
      ...this.detectCycles(),
    ];

    if (!pluginValidators || pluginValidators.length === 0 || !root) {
      return builtIn;
    }

    const pluginDiagnostics: ValidationDiagnostic[] = [];
    for (const validator of pluginValidators) {
      pluginDiagnostics.push(...validator(root, [...builtIn, ...pluginDiagnostics]));
    }

    return [...builtIn, ...pluginDiagnostics];
  }
}
