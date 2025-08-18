-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "testfest";

-- CreateTable
CREATE TABLE "testfest"."users" (
    "id" UUID NOT NULL,
    "sub" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testfest"."rooms" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testfest"."room_members" (
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_groupier" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "room_members_pkey" PRIMARY KEY ("room_id","user_id")
);

-- CreateTable
CREATE TABLE "testfest"."issues" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "created_by" UUID,
    "script_id" INTEGER,
    "description" TEXT,
    "images" JSONB,
    "is_issue" BOOLEAN NOT NULL DEFAULT false,
    "is_annoyance" BOOLEAN NOT NULL DEFAULT false,
    "is_existing_upper_env" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT DEFAULT 'open',
    "jira_key" TEXT,
    "is_not_sure_how_to_test" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testfest"."session" (
    "sid" VARCHAR(255) NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "testfest"."test_script" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "script_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testfest"."test_script_line" (
    "id" UUID NOT NULL,
    "test_script_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_script_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_sub_key" ON "testfest"."users"("sub");

-- CreateIndex
CREATE UNIQUE INDEX "test_script_room_id_script_id_key" ON "testfest"."test_script"("room_id", "script_id");

-- AddForeignKey
ALTER TABLE "testfest"."rooms" ADD CONSTRAINT "rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "testfest"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testfest"."room_members" ADD CONSTRAINT "room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "testfest"."rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testfest"."room_members" ADD CONSTRAINT "room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "testfest"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testfest"."issues" ADD CONSTRAINT "issues_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "testfest"."rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testfest"."issues" ADD CONSTRAINT "issues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "testfest"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testfest"."test_script" ADD CONSTRAINT "test_script_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "testfest"."rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testfest"."test_script_line" ADD CONSTRAINT "test_script_line_test_script_id_fkey" FOREIGN KEY ("test_script_id") REFERENCES "testfest"."test_script"("id") ON DELETE CASCADE ON UPDATE CASCADE;
