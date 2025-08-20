-- CreateTable
CREATE TABLE "testfest"."script_library" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "script_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testfest"."script_library_line" (
    "id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,

    CONSTRAINT "script_library_line_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "testfest"."script_library_line" ADD CONSTRAINT "script_library_line_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "testfest"."script_library"("id") ON DELETE CASCADE ON UPDATE CASCADE;
