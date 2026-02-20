import type { ScaffoldOptions, TemplateFile } from '../commands/new.js';

export function makePackageJson(opts: ScaffoldOptions, extra?: Record<string, unknown>): string {
  const pkg: Record<string, unknown> = {
    name: opts.projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'isotope dev',
      synth: 'isotope synth',
      test: 'vitest run',
      'test:watch': 'vitest',
    },
    dependencies: {
      '@isotope/dsl': '^0.0.1',
    },
    devDependencies: {
      typescript: '^5.9.0',
      vitest: '^3.1.0',
    },
    ...extra,
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

export function makeTsconfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      jsx: 'react-jsx',
      jsxImportSource: '@isotope/dsl',
    },
    include: ['pipelines/**/*', 'env/**/*'],
  };
  return JSON.stringify(config, null, 2) + '\n';
}

export function makeConfig(): string {
  return `import { defineConfig } from '@isotope/dsl';

export default defineConfig({
  kafka: { bootstrapServers: 'localhost:9092' },
});
`;
}

export function makeGitignore(): string {
  return `node_modules/
dist/
*.tsbuildinfo
.env
.env.local
`;
}

export function makeDevEnv(): string {
  return `import { defineEnvironment } from '@isotope/dsl';

export default defineEnvironment({
  name: 'dev',
});
`;
}

export function sharedFiles(opts: ScaffoldOptions): TemplateFile[] {
  return [
    { path: 'package.json', content: makePackageJson(opts) },
    { path: 'tsconfig.json', content: makeTsconfig() },
    { path: 'isotope.config.ts', content: makeConfig() },
    { path: '.gitignore', content: makeGitignore() },
    { path: 'env/dev.ts', content: makeDevEnv() },
  ];
}
