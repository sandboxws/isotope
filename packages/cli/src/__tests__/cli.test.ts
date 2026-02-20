import { describe, it, expect } from 'vitest';
import { createProgram } from '../program.js';

describe('CLI entry point', () => {
  it('creates a program named "isotope"', () => {
    const program = createProgram();
    expect(program.name()).toBe('isotope');
  });

  it('has version 0.0.1', () => {
    const program = createProgram();
    expect(program.version()).toBe('0.0.1');
  });

  it('registers all four commands', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('new');
    expect(commandNames).toContain('synth');
    expect(commandNames).toContain('dev');
    expect(commandNames).toContain('inspect');
  });
});
