import { Command } from 'commander';
import pc from 'picocolors';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveProjectContext,
  loadPipeline,
} from '../discovery.js';
import { synthesizeApp, SynthContext, compilePlan } from '@isotope/dsl';
import type { PipelineArtifact, ConstructNode, ValidationDiagnostic } from '@isotope/dsl';

// ── Types ───────────────────────────────────────────────────────────

export interface SynthResult {
  readonly name: string;
  readonly tree: ConstructNode;
}

// ── Command registration ────────────────────────────────────────────

export function registerSynthCommand(program: Command): void {
  program
    .command('synth')
    .description('Compile pipelines to execution plans')
    .option('-p, --pipeline <name>', 'Synthesize a specific pipeline')
    .option('-e, --env <name>', 'Environment name (loads env/<name>.ts)')
    .option('-o, --outdir <dir>', 'Output directory', 'dist')
    .action(async (opts: { pipeline?: string; env?: string; outdir: string }) => {
      await runSynth(opts);
    });
}

// ── Synth logic ─────────────────────────────────────────────────────

export async function runSynth(opts: {
  pipeline?: string;
  env?: string;
  outdir: string;
  projectDir?: string;
}): Promise<SynthResult[]> {
  const projectDir = opts.projectDir ?? process.cwd();
  const ctx = await resolveProjectContext(projectDir, {
    pipeline: opts.pipeline,
    env: opts.env,
  });

  if (ctx.pipelines.length === 0) {
    console.log(pc.yellow('No pipelines found in pipelines/ directory.'));
    return [];
  }

  console.log(pc.dim(`Synthesizing ${ctx.pipelines.length} pipeline(s)...\n`));

  const results: SynthResult[] = [];
  let hasErrors = false;

  for (const discovered of ctx.pipelines) {
    const pipelineNode = await loadPipeline(discovered.entryPoint);

    // Validate the pipeline
    const synthCtx = new SynthContext();
    synthCtx.buildFromTree(pipelineNode);
    const diagnostics = synthCtx.validate(pipelineNode);

    const errors = diagnostics.filter((d) => d.severity === 'error');
    const warnings = diagnostics.filter((d) => d.severity === 'warning');

    if (warnings.length > 0) {
      for (const w of warnings) {
        console.log(pc.yellow(`  Warning: ${w.message}`));
      }
    }

    if (errors.length > 0) {
      hasErrors = true;
      console.log(pc.red(`  ${discovered.name}: ${errors.length} error(s)`));
      for (const e of errors) {
        reportDiagnostic(e, discovered.entryPoint);
      }
      continue;
    }

    // Synthesize
    const result = synthesizeApp(
      { name: discovered.name, children: pipelineNode },
      {
        env: ctx.env ?? undefined,
        config: ctx.config ?? undefined,
      },
    );

    for (const artifact of result.pipelines) {
      const synthResult: SynthResult = { name: artifact.name, tree: artifact.tree };
      results.push(synthResult);
      writePipelineOutput(synthResult, opts.outdir, projectDir);
    }

    // If no pipelines were extracted, treat the whole tree as a single pipeline
    if (result.pipelines.length === 0) {
      const synthResult: SynthResult = { name: discovered.name, tree: pipelineNode };
      results.push(synthResult);
      writePipelineOutput(synthResult, opts.outdir, projectDir);
    }
  }

  if (hasErrors) {
    console.log(pc.red(`\nSynthesis failed with errors.`));
    process.exitCode = 1;
    return results;
  }

  console.log(pc.green(`\nSynthesis complete. ${results.length} pipeline(s) written.\n`));

  for (const result of results) {
    console.log(
      `  ${pc.cyan(result.name)} ${pc.dim(`→ ${opts.outdir}/${result.name}/`)}`,
    );
  }

  console.log('');
  return results;
}

// ── Output ──────────────────────────────────────────────────────────

function writePipelineOutput(
  result: SynthResult,
  outdir: string,
  projectDir: string,
): void {
  const pipelineDir = join(projectDir, outdir, result.name);
  mkdirSync(pipelineDir, { recursive: true });

  // Write the construct tree as JSON (for debugging/inspection)
  const planJson = JSON.stringify(result.tree, null, 2);
  writeFileSync(join(pipelineDir, 'plan.json'), planJson, 'utf-8');

  // Compile to Protobuf ExecutionPlan and write binary .pb file
  try {
    const { binary } = compilePlan(result.tree, { sourceFile: result.name });
    writeFileSync(join(pipelineDir, 'plan.pb'), binary);
  } catch (err) {
    console.log(pc.yellow(`  Warning: Protobuf compilation skipped for ${result.name}: ${(err as Error).message}`));
  }
}

// ── Error reporting ─────────────────────────────────────────────────

function reportDiagnostic(
  diagnostic: ValidationDiagnostic,
  entryPoint: string,
): void {
  const location = diagnostic.nodeId
    ? ` (node: ${diagnostic.nodeId})`
    : '';
  const component = diagnostic.component
    ? ` [${diagnostic.component}]`
    : '';
  console.log(
    pc.red(`    Error${component}${location}: ${diagnostic.message}`),
  );
  console.log(pc.dim(`    at ${entryPoint}`));
}
