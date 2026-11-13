import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // `generate` and `validate` can run before a Supabase project is configured.
  // Database commands require DATABASE_URL to be set in the environment.
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
