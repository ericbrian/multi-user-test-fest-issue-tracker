/*
  Warnings:

  - Added the required column `test_script_line_id` to the `test_script_line` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "testfest"."test_script_line" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "test_script_line_id" INTEGER NOT NULL;
