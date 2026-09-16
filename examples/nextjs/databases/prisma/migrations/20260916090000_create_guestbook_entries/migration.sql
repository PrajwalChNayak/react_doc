-- CreateTable
CREATE TABLE "guestbook_entries" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guestbook_entries_pkey" PRIMARY KEY ("id")
);
