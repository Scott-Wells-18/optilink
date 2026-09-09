-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'ISSUED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "ThermalBasis" AS ENUM ('SIMILAR_COMPONENT', 'AMBIENT');

-- CreateEnum
CREATE TYPE "RcdKind" AS ENUM ('TYPE_I', 'TYPE_II', 'TYPE_III', 'DELAYED');

-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('BEFORE', 'AFTER', 'GENERAL');

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "companyName" TEXT NOT NULL DEFAULT 'OptiLink',
    "tradingName" TEXT,
    "abn" TEXT,
    "licenceNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "suburb" TEXT,
    "state" TEXT DEFAULT 'NSW',
    "postcode" TEXT,
    "primaryColour" TEXT NOT NULL DEFAULT '#0B3B60',
    "accentColour" TEXT NOT NULL DEFAULT '#F5A623',
    "logoFileId" TEXT,
    "logoMarkFileId" TEXT,
    "defaultTechnicianName" TEXT,
    "defaultTechnicianLicence" TEXT,
    "reportFooterText" TEXT,
    "reportIntroText" TEXT,
    "nextReportNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "suburb" TEXT,
    "state" TEXT DEFAULT 'NSW',
    "postcode" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Electrical inspection report',
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "clientId" TEXT,
    "siteName" TEXT,
    "siteAddress" TEXT,
    "siteContact" TEXT,
    "inspectionDate" TIMESTAMP(3),
    "issuedDate" TIMESTAMP(3),
    "technicianName" TEXT,
    "technicianLicence" TEXT,
    "scopeOfWork" TEXT,
    "executiveSummary" TEXT,
    "recommendations" TEXT,
    "limitations" TEXT,
    "ambientTempC" DOUBLE PRECISION,
    "weatherNotes" TEXT,
    "equipmentUsed" TEXT,
    "overallRiskOverride" "RiskLevel",
    "includeThermal" BOOLEAN NOT NULL DEFAULT true,
    "includeRcd" BOOLEAN NOT NULL DEFAULT true,
    "includeObservations" BOOLEAN NOT NULL DEFAULT true,
    "includePhotos" BOOLEAN NOT NULL DEFAULT true,
    "includeGlossary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThermalFinding" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "component" TEXT,
    "loadAmps" DOUBLE PRECISION,
    "emissivity" DOUBLE PRECISION DEFAULT 0.95,
    "basis" "ThermalBasis" NOT NULL DEFAULT 'SIMILAR_COMPONENT',
    "measuredTempC" DOUBLE PRECISION,
    "referenceTempC" DOUBLE PRECISION,
    "severityOverride" "RiskLevel",
    "findings" TEXT,
    "recommendedAction" TEXT,
    "clientExplanation" TEXT,
    "rectifiedOnSite" BOOLEAN NOT NULL DEFAULT false,
    "thermalImageId" TEXT,
    "visualImageId" TEXT,

    CONSTRAINT "ThermalFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RcdTest" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "boardName" TEXT,
    "circuitDescription" TEXT,
    "rcdKind" "RcdKind" NOT NULL DEFAULT 'TYPE_II',
    "ratedCurrentMa" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "poles" TEXT,
    "make" TEXT,
    "tripTimeRatedMs" DOUBLE PRECISION,
    "tripTime5xMs" DOUBLE PRECISION,
    "rampTripMa" DOUBLE PRECISION,
    "pushButtonOk" BOOLEAN,
    "notRequired" BOOLEAN NOT NULL DEFAULT false,
    "resultOverride" BOOLEAN,
    "notes" TEXT,

    CONSTRAINT "RcdTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "description" TEXT,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "clauseReference" TEXT,
    "recommendedAction" TEXT,
    "clientExplanation" TEXT,
    "rectifiedOnSite" BOOLEAN NOT NULL DEFAULT false,
    "photoId" TEXT,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "kind" "PhotoKind" NOT NULL DEFAULT 'GENERAL',
    "pairKey" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "location" TEXT,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadedFile_storedName_key" ON "UploadedFile"("storedName");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reference_key" ON "Report"("reference");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_clientId_idx" ON "Report"("clientId");

-- CreateIndex
CREATE INDEX "ThermalFinding_reportId_idx" ON "ThermalFinding"("reportId");

-- CreateIndex
CREATE INDEX "RcdTest_reportId_idx" ON "RcdTest"("reportId");

-- CreateIndex
CREATE INDEX "Observation_reportId_idx" ON "Observation"("reportId");

-- CreateIndex
CREATE INDEX "Photo_reportId_idx" ON "Photo"("reportId");

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_logoMarkFileId_fkey" FOREIGN KEY ("logoMarkFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThermalFinding" ADD CONSTRAINT "ThermalFinding_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThermalFinding" ADD CONSTRAINT "ThermalFinding_thermalImageId_fkey" FOREIGN KEY ("thermalImageId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThermalFinding" ADD CONSTRAINT "ThermalFinding_visualImageId_fkey" FOREIGN KEY ("visualImageId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcdTest" ADD CONSTRAINT "RcdTest_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
