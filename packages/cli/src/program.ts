import { Command, Help } from 'commander';
import pc from 'picocolors';
import { registerNewCommand } from './commands/new.js';
import { registerSynthCommand } from './commands/synth.js';
import { registerDevCommand } from './commands/dev.js';
import { registerInspectCommand } from './commands/inspect.js';

const VERSION = '0.0.1';

// ── Program setup ───────────────────────────────────────────────────

export function createProgram(): Command {
  const program = new Command();

  program
    .name('isotope')
    .description('Streaming framework — TSX DSL that compiles to Protobuf ExecutionPlans')
    .version(VERSION);

  // Styled help output
  program.configureHelp({
    helpWidth: 80,
    showGlobalOptions: false,
    styleTitle: (str: string) => pc.bold(pc.cyan(str)),
    styleUsage: (str: string) => pc.yellow(str),
    styleCommandText: (str: string) => pc.green(str),
    styleCommandDescription: (str: string) => pc.dim(str),
    styleSubcommandTerm: (str: string) => pc.green(str),
    styleSubcommandDescription: (str: string) => pc.dim(str),
    styleOptionTerm: (str: string) => pc.yellow(str),
    styleOptionDescription: (str: string) => pc.dim(str),
    styleArgumentTerm: (str: string) => pc.yellow(str),
    styleArgumentDescription: (str: string) => pc.dim(str),
    styleDescriptionText: (str: string) => pc.white(str),
    formatHelp(cmd: Command, helper: Help): string {
      const output: string = Help.prototype.formatHelp.call(this, cmd, helper);

      if (cmd.name() === 'isotope' && !cmd.parent) {
        const header = [
          '',
          `  ${pc.bold(pc.cyan('isotope'))} ${pc.dim(`v${VERSION}`)}`,
          `  ${pc.dim('Streaming framework — TSX DSL → Protobuf ExecutionPlans')}`,
          '',
        ].join('\n');

        const lines = output.split('\n');
        const withoutDesc = lines.filter(
          (l: string) => !l.includes('Streaming framework'),
        );
        return header + '\n' + withoutDesc.join('\n');
      }

      return output;
    },
  });

  // Register commands
  registerNewCommand(program);
  registerSynthCommand(program);
  registerDevCommand(program);
  registerInspectCommand(program);

  return program;
}
