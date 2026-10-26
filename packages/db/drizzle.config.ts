import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  // Supabase CLI reads this folder too, so `supabase db reset` locally applies the same SQL.
  out: '../../supabase/migrations',
  casing: 'snake_case',
  migrations: { prefix: 'supabase' },
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? 'postgres://localhost/orbita',
  },
});
