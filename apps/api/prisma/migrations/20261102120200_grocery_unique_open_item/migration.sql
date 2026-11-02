-- Duplicate open grocery items (same user, same name ignoring case and
-- spaces) came from two requests racing past the app's own duplicate check.
-- Keep the oldest of each, so the unique index in the next migration can be
-- built. Ticked-off items are history and may repeat.
DELETE FROM "GroceryItem" a
USING "GroceryItem" b
WHERE a."userId" = b."userId"
  AND NOT a."checked" AND NOT b."checked"
  AND lower(btrim(a."name")) = lower(btrim(b."name"))
  AND (a."createdAt", a."id") > (b."createdAt", b."id");
