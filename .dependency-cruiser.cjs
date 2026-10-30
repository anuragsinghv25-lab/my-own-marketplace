/**
 * Module boundaries (docs/architecture/04-system-architecture.md).
 * Run: pnpm depcheck
 */
module.exports = {
  forbidden: [
    {
      name: 'packages-never-import-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'modules-are-framework-free',
      comment: 'Business modules must not depend on Next.js, React or Supabase SDKs; adapters live in apps/web.',
      severity: 'error',
      from: { path: '^packages/(modules|domain|authz|db|contract)/' },
      to: { path: 'node_modules/(next|react|react-dom|@supabase)/' },
    },
    {
      name: 'ui-has-no-business-logic',
      severity: 'error',
      from: { path: '^packages/ui/' },
      to: { path: '^packages/(modules|db|authz)/' },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'Every import must resolve: a package must declare what it uses in its own package.json.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.next|node_modules|dist|coverage)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
