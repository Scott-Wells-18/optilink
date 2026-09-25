-- Reports made before a contact could be chosen printed whichever contact the
-- site happened to have first. Where the site has only ever had one contact
-- that choice was not a choice at all, so those reports keep the person they
-- were already printing. A site with two or more is left unset, because which
-- of them the report was for was never actually recorded.
UPDATE "Inspection" i
SET "contactId" = c."id"
FROM "Contact" c
WHERE c."siteId" = i."siteId"
  AND i."contactId" IS NULL
  AND (SELECT COUNT(*) FROM "Contact" x WHERE x."siteId" = i."siteId") = 1;

UPDATE "Job" j
SET "contactId" = c."id"
FROM "Contact" c
WHERE c."siteId" = j."siteId"
  AND j."contactId" IS NULL
  AND (SELECT COUNT(*) FROM "Contact" x WHERE x."siteId" = j."siteId") = 1;

UPDATE "RcdReport" r
SET "contactId" = c."id"
FROM "Contact" c
WHERE c."siteId" = r."siteId"
  AND r."contactId" IS NULL
  AND (SELECT COUNT(*) FROM "Contact" x WHERE x."siteId" = r."siteId") = 1;

-- A power analysis already recorded a name. Where that name is one of the
-- site's contacts it becomes the chosen contact; a name typed in by hand
-- stays as it is.
UPDATE "PowerAnalysis" p
SET "contactId" = c."id"
FROM "Contact" c
WHERE c."siteId" = p."siteId"
  AND p."contactId" IS NULL
  AND p."contactName" IS NOT NULL
  AND lower(btrim(c."name")) = lower(btrim(p."contactName"));
