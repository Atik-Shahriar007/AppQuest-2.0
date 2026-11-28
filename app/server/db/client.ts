import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

// Supabase's transaction pooler does not support prepared statements.
const sql = postgres(env.DATABASE_URL, { max: 10, prepare: false });

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export { schema, sql as rawSql };
