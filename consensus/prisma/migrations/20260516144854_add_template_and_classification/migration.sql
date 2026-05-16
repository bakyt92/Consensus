-- AlterTable
ALTER TABLE "Message" ADD COLUMN "category" TEXT;
ALTER TABLE "Message" ADD COLUMN "categoryConfidence" REAL;
ALTER TABLE "Message" ADD COLUMN "sentiment" TEXT;
ALTER TABLE "Message" ADD COLUMN "sentimentConfidence" REAL;
ALTER TABLE "Message" ADD COLUMN "spans" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "agenda" TEXT NOT NULL,
    "agendaTitle" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "maxParticipants" INTEGER NOT NULL DEFAULT 8,
    "template" TEXT NOT NULL DEFAULT 'none',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "consensus" TEXT NOT NULL DEFAULT 'PENDING',
    "consensusPercent" INTEGER NOT NULL DEFAULT 0,
    "finalSummary" TEXT,
    "adminId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "Room_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Room" ("adminId", "agenda", "agendaTitle", "closedAt", "code", "consensus", "consensusPercent", "createdAt", "criteria", "finalSummary", "id", "maxParticipants", "status") SELECT "adminId", "agenda", "agendaTitle", "closedAt", "code", "consensus", "consensusPercent", "createdAt", "criteria", "finalSummary", "id", "maxParticipants", "status" FROM "Room";
DROP TABLE "Room";
ALTER TABLE "new_Room" RENAME TO "Room";
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");
CREATE INDEX "Room_adminId_idx" ON "Room"("adminId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
