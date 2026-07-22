import "dotenv/config";
import { defineConfig } from "prisma/config";

function buildDatabaseUrl(): string {
    if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
    }

    const host = process.env.DB_HOST || "localhost";
    const port = process.env.DB_PORT || "5432";
    const database = process.env.DB_NAME || "sms_gateway";
    const user = process.env.DB_USER || "sms_user";
    const password = process.env.DB_PASSWORD || "";

    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: buildDatabaseUrl(),
  },
});
