-- Every timestamp column is `timestamp without time zone` holding UTC, but
-- Prisma binds a JS Date in $queryRaw/$executeRaw as timestamptz. Comparing
-- the two (and casting now()) uses the session TimeZone, so on a server set
-- to Asia/Kolkata every raw-SQL window slid 5.5 h: a log at 00:00 UTC fell
-- out of its own day, and RecipeSuggestion stamped now() 5.5 h ahead.
-- Pinning the database's sessions to UTC fixes every raw query at once;
-- it applies to new connections (restart the API after migrating).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END $$;
