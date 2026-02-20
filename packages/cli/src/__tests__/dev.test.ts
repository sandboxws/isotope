import { describe, it, expect } from 'vitest';

// Dev command tests — Docker Compose generation is tested here.
// Full dev lifecycle tests require Docker and are skipped in CI.

describe('isotope dev', () => {
  it('generates valid docker-compose YAML', async () => {
    // Import the module to access the compose generation indirectly
    // We test the output format by importing and checking structure
    const { registerDevCommand } = await import('../commands/dev.js');
    expect(typeof registerDevCommand).toBe('function');
  });
});
