-- One open item per name per user, enforced by Postgres. Not expressible in
-- schema.prisma (expression + partial index), so it lives only here; the
-- grocery routes insert with ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "GroceryItem_open_name_key"
  ON "GroceryItem" ("userId", lower(btrim("name"))) WHERE NOT "checked";
