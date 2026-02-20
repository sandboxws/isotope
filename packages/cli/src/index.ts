export { createProgram } from './program.js';

const program = (await import('./program.js')).createProgram();
program.parse();
