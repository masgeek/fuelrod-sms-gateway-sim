-- CreateTable
CREATE TABLE "messages" (
    "message_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "network_code" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "callback_status" TEXT NOT NULL DEFAULT 'pending',
    "delivered_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "failed_callbacks" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "next_retry" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_callbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callback_queue" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "fallback_url" TEXT,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "next_retry" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "callback_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_migrations" (
    "version" INTEGER NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version")
);

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE INDEX "messages_callback_status_idx" ON "messages"("callback_status");

-- CreateIndex
CREATE INDEX "messages_deleted_at_idx" ON "messages"("deleted_at");

-- CreateIndex
CREATE INDEX "failed_callbacks_next_retry_idx" ON "failed_callbacks"("next_retry");

-- CreateIndex
CREATE INDEX "callback_queue_status_next_retry_idx" ON "callback_queue"("status", "next_retry");
