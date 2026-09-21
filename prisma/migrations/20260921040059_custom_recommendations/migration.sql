-- CreateTable
CREATE TABLE "CustomRecommendation" (
    "id" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomRecommendation_cause_idx" ON "CustomRecommendation"("cause");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRecommendation_cause_text_key" ON "CustomRecommendation"("cause", "text");
