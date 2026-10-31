CREATE TYPE "Madhhab" AS ENUM ('hanafi', 'maliki', 'shafii', 'hanbali');
ALTER TABLE "Person" ADD COLUMN "madhhabs" "Madhhab"[] NOT NULL DEFAULT ARRAY[]::"Madhhab"[];
CREATE TABLE "PersonSource" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  CONSTRAINT "PersonSource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PersonSource_personId_idx" ON "PersonSource"("personId");
ALTER TABLE "PersonSource" ADD CONSTRAINT "PersonSource_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
