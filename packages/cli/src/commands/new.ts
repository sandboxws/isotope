import { Command } from 'commander';
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { getMinimalTemplates } from '../templates/minimal.js';
import { getKafkaTemplates } from '../templates/kafka.js';

export type TemplateName = 'minimal' | 'kafka';
export type PackageManager = 'pnpm' | 'npm' | 'yarn';

export interface ScaffoldOptions {
  projectName: string;
  template: TemplateName;
  pm: PackageManager;
  gitInit: boolean;
  installDeps: boolean;
}

export interface TemplateFile {
  path: string;
  content: string;
}

type TemplateFactory = (opts: ScaffoldOptions) => TemplateFile[];

const TEMPLATE_FACTORIES: Record<TemplateName, TemplateFactory> = {
  minimal: getMinimalTemplates,
  kafka: getKafkaTemplates,
};

const TEMPLATE_DESCRIPTIONS: Record<TemplateName, string> = {
  minimal: 'GeneratorSource → ConsoleSink',
  kafka: 'KafkaSource → Filter → Map → KafkaSink',
};

// ── Command registration ────────────────────────────────────────────

export function registerNewCommand(program: Command): void {
  program
    .command('new')
    .argument('<project-name>', 'Name of the new project')
    .option('-t, --template <template>', 'Project template (minimal, kafka)')
    .option('--pm <pm>', 'Package manager (pnpm, npm, yarn)')
    .option('-y, --yes', 'Use defaults, skip prompts')
    .option('--no-git', 'Skip git initialization')
    .option('--no-install', 'Skip dependency installation')
    .description('Create a new Isotope project')
    .action(async (projectName: string, opts: Record<string, unknown>) => {
      await runNewCommand(projectName, opts);
    });
}

// ── Command logic ───────────────────────────────────────────────────

export async function runNewCommand(
  projectName: string,
  opts: Record<string, unknown>,
): Promise<void> {
  const projectDir = resolve(projectName);

  if (existsSync(projectDir)) {
    console.error(pc.red(`Error: Directory "${projectName}" already exists.`));
    process.exitCode = 1;
    return;
  }

  const nonInteractive = opts.yes === true;

  let options: ScaffoldOptions;

  if (nonInteractive) {
    options = {
      projectName,
      template: validateTemplate(opts.template as string) ?? 'minimal',
      pm: validatePm(opts.pm as string) ?? 'pnpm',
      gitInit: opts.git !== false,
      installDeps: opts.install !== false,
    };
  } else {
    const collected = await collectOptions(projectName, opts);
    if (!collected) return;
    options = collected;
  }

  scaffoldProject(projectDir, options);

  if (options.gitInit) {
    try {
      execSync('git init', { cwd: projectDir, stdio: 'ignore' });
    } catch {
      console.warn(pc.yellow('Warning: git init failed. Skipping.'));
    }
  }

  if (options.installDeps) {
    try {
      console.log(pc.dim(`Running ${options.pm} install...`));
      execSync(`${options.pm} install`, { cwd: projectDir, stdio: 'inherit' });
    } catch {
      console.warn(pc.yellow('Warning: dependency installation failed. Run it manually.'));
    }
  }

  console.log('');
  console.log(pc.green('Project created successfully!'));
  console.log('');
  console.log(`  ${pc.dim('cd')} ${projectName}`);
  console.log(`  ${pc.dim(options.pm)} run dev`);
  console.log('');
}

// ── Interactive prompts ─────────────────────────────────────────────

async function collectOptions(
  projectName: string,
  cliOpts: Record<string, unknown>,
): Promise<ScaffoldOptions | null> {
  clack.intro(pc.bgCyan(pc.black(' isotope new ')));

  const template = cliOpts.template
    ? validateTemplate(cliOpts.template as string) ?? 'minimal'
    : await promptTemplate();

  if (clack.isCancel(template)) {
    clack.cancel('Operation cancelled.');
    return null;
  }

  const pm = cliOpts.pm
    ? validatePm(cliOpts.pm as string) ?? 'pnpm'
    : await promptPm();

  if (clack.isCancel(pm)) {
    clack.cancel('Operation cancelled.');
    return null;
  }

  const gitInit = await clack.confirm({
    message: 'Initialize a git repository?',
    initialValue: true,
  });

  if (clack.isCancel(gitInit)) {
    clack.cancel('Operation cancelled.');
    return null;
  }

  const installDeps = await clack.confirm({
    message: `Install dependencies with ${pm as string}?`,
    initialValue: true,
  });

  if (clack.isCancel(installDeps)) {
    clack.cancel('Operation cancelled.');
    return null;
  }

  clack.outro(pc.green('Scaffolding project...'));

  return {
    projectName,
    template: template as TemplateName,
    pm: pm as PackageManager,
    gitInit: gitInit as boolean,
    installDeps: installDeps as boolean,
  };
}

async function promptTemplate(): Promise<TemplateName | symbol> {
  return clack.select({
    message: 'Which template would you like to use?',
    options: [
      { value: 'minimal', label: 'Minimal', hint: TEMPLATE_DESCRIPTIONS.minimal },
      { value: 'kafka', label: 'Kafka', hint: TEMPLATE_DESCRIPTIONS.kafka },
    ],
  }) as Promise<TemplateName | symbol>;
}

async function promptPm(): Promise<PackageManager | symbol> {
  return clack.select({
    message: 'Which package manager?',
    options: [
      { value: 'pnpm', label: 'pnpm', hint: 'recommended' },
      { value: 'npm', label: 'npm' },
      { value: 'yarn', label: 'yarn' },
    ],
  }) as Promise<PackageManager | symbol>;
}

// ── Validation ──────────────────────────────────────────────────────

function validateTemplate(value: string | undefined): TemplateName | null {
  const valid: TemplateName[] = ['minimal', 'kafka'];
  return valid.includes(value as TemplateName) ? (value as TemplateName) : null;
}

function validatePm(value: string | undefined): PackageManager | null {
  const valid: PackageManager[] = ['pnpm', 'npm', 'yarn'];
  return valid.includes(value as PackageManager) ? (value as PackageManager) : null;
}

// ── Scaffolding ─────────────────────────────────────────────────────

export function scaffoldProject(projectDir: string, options: ScaffoldOptions): void {
  const factory = TEMPLATE_FACTORIES[options.template];
  const files = factory(options);

  for (const file of files) {
    const filePath = join(projectDir, file.path);
    const dir = join(filePath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, file.content, 'utf-8');
  }
}
