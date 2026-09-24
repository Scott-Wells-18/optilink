-- Every RCD test filed before reports existed becomes a report of its own, so
-- nothing already issued disappears from the tree. One board per report is
-- exactly what those runs were.
INSERT INTO "RcdReport" ("id", "siteId", "name", "date", "createdAt", "updatedAt")
SELECT "id", "siteId", "name", "date", "createdAt", "updatedAt"
FROM "RcdTestRun"
WHERE "reportId" IS NULL;

UPDATE "RcdTestRun" SET "reportId" = "id" WHERE "reportId" IS NULL;
