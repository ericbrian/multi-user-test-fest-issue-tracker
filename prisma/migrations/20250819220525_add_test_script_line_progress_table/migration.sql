-- CreateTable
CREATE TABLE "testfest"."test_script_line_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "test_script_line_id" UUID NOT NULL,
    "is_checked" BOOLEAN NOT NULL DEFAULT false,
    "checked_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_script_line_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_script_line_progress_user_id_test_script_line_id_key" ON "testfest"."test_script_line_progress"("user_id", "test_script_line_id");

-- AddForeignKey
ALTER TABLE "testfest"."test_script_line_progress" ADD CONSTRAINT "test_script_line_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "testfest"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testfest"."test_script_line_progress" ADD CONSTRAINT "test_script_line_progress_test_script_line_id_fkey" FOREIGN KEY ("test_script_line_id") REFERENCES "testfest"."test_script_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;
