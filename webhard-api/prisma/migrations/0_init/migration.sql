-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "company_name" TEXT NOT NULL,
    "manager_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "business_registration_number" TEXT NOT NULL,
    "representative_name" TEXT NOT NULL,
    "business_type" TEXT,
    "business_category" TEXT,
    "business_address" TEXT NOT NULL,
    "business_registration_file_url" TEXT,
    "business_registration_file_name" TEXT,
    "manager_position" TEXT NOT NULL,
    "manager_phone" TEXT NOT NULL,
    "manager_email" TEXT NOT NULL,
    "accountant_name" TEXT,
    "accountant_phone" TEXT,
    "accountant_email" TEXT,
    "accountant_fax" TEXT,
    "quote_method_email" BOOLEAN DEFAULT false,
    "quote_method_fax" BOOLEAN DEFAULT false,
    "quote_method_sms" BOOLEAN DEFAULT false,
    "status" TEXT DEFAULT 'active',
    "webhard_access" BOOLEAN NOT NULL DEFAULT true,
    "laser_only" BOOLEAN NOT NULL DEFAULT false,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhard_files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "folder_id" TEXT,
    "company_id" INTEGER,
    "uploaded_by" TEXT NOT NULL,
    "inquiry_number" TEXT,
    "is_downloaded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "webhard_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhard_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "company_id" INTEGER,
    "path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "webhard_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_storage" (
    "company_id" INTEGER NOT NULL,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_storage_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "webhard_settings" (
    "user_id" TEXT NOT NULL,
    "font_size" TEXT NOT NULL DEFAULT 'small',
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "download_folder_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhard_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "webhard_folder_favorites" (
    "user_id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhard_folder_favorites_pkey" PRIMARY KEY ("user_id","folder_id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "contact_id" BIGINT,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "task_type" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "priority" VARCHAR(10) NOT NULL DEFAULT 'normal',
    "machine_id" TEXT,
    "assigned_to" VARCHAR(100),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "estimated_duration" INTEGER,
    "actual_duration" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "order_id" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_workers" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "pin_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'field_worker',
    "worker_type" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "allowed_ips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_access_logs" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT,
    "action" VARCHAR(30) NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "contact_id" BIGINT,
    "inquiry_number" TEXT,
    "company_name" VARCHAR(200) NOT NULL,
    "customer_name" VARCHAR(100),
    "customer_phone" VARCHAR(50),
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "order_type" VARCHAR(30) NOT NULL DEFAULT 'standard',
    "status" VARCHAR(30) NOT NULL DEFAULT 'inquiry_received',
    "priority" VARCHAR(10) NOT NULL DEFAULT 'normal',
    "drawing_file_count" INTEGER NOT NULL DEFAULT 0,
    "webhard_folder_id" TEXT,
    "dxf_classified_count" INTEGER NOT NULL DEFAULT 0,
    "dxf_total_price" INTEGER NOT NULL DEFAULT 0,
    "nesting_sheet_count" INTEGER,
    "nesting_utilization" DOUBLE PRECISION,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "cutting_started_at" TIMESTAMP(3),
    "cutting_completed_at" TIMESTAMP(3),
    "post_processing_started_at" TIMESTAMP(3),
    "post_processing_completed_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "scheduled_auto_complete_at" TIMESTAMP(3),
    "delivery_method" VARCHAR(50),
    "delivery_address" TEXT,
    "delivery_note" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30),
    "source" VARCHAR(30) NOT NULL,
    "actor_name" VARCHAR(100),
    "data" JSONB,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "program_type" VARCHAR(30) NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_heartbeats" (
    "id" TEXT NOT NULL,
    "program_type" VARCHAR(30) NOT NULL,
    "instance_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'online',
    "version" VARCHAR(20),
    "hostname" VARCHAR(100),
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "delivery_type" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "recipient_name" VARCHAR(100),
    "recipient_phone" VARCHAR(50),
    "address" TEXT,
    "tracking_number" VARCHAR(100),
    "courier_company" VARCHAR(50),
    "scheduled_date" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "current_stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "min_stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "thickness" DOUBLE PRECISION,
    "unit_price" INTEGER,
    "supplier" VARCHAR(200),
    "location" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "previous_stock" DOUBLE PRECISION NOT NULL,
    "new_stock" DOUBLE PRECISION NOT NULL,
    "order_id" TEXT,
    "reason" VARCHAR(200),
    "actor_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" SERIAL NOT NULL,
    "filename" VARCHAR(500) NOT NULL,
    "company_name" VARCHAR(200),
    "status" VARCHAR(30) NOT NULL,
    "contact_id" INTEGER,
    "order_id" TEXT,
    "error_message" TEXT,
    "md5_hash" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company_name" TEXT,
    "position" TEXT,
    "subject" TEXT,
    "message" TEXT,
    "status" TEXT DEFAULT 'new',
    "contact_type" TEXT,
    "source" VARCHAR(20) DEFAULT 'website',
    "inquiry_type" VARCHAR(20),
    "inquiry_number" TEXT,
    "work_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "is_read" BOOLEAN DEFAULT false,
    "previous_status" TEXT,
    "order_type" VARCHAR(30) DEFAULT 'standard',
    "memo" TEXT,
    "original_filename" TEXT,
    "drawing_file_url" TEXT,
    "drawing_file_name" TEXT,
    "drawing_type" TEXT,
    "reference_photos_urls" TEXT,
    "drawing_modification" TEXT,
    "drawing_notes" TEXT,
    "drawing_file_count" INTEGER DEFAULT 0,
    "box_shape" TEXT,
    "length" TEXT,
    "width" TEXT,
    "height" TEXT,
    "material" TEXT,
    "has_physical_sample" BOOLEAN DEFAULT false,
    "has_reference_photos" BOOLEAN DEFAULT false,
    "sample_notes" TEXT,
    "delivery_method" TEXT,
    "delivery_address" TEXT,
    "delivery_name" TEXT,
    "delivery_phone" TEXT,
    "delivery_type" TEXT,
    "delivery_company_name" TEXT,
    "delivery_company_phone" TEXT,
    "delivery_company_address" TEXT,
    "delivery_note" TEXT,
    "delivery_method_changed_at" TIMESTAMP(3),
    "receipt_method" TEXT,
    "delivery_proof_image" TEXT,
    "delivery_complete_image" TEXT,
    "revision_request_title" TEXT,
    "revision_request_content" TEXT,
    "revision_requested_at" TIMESTAMP(3),
    "revision_request_file_url" TEXT,
    "revision_request_file_name" TEXT,
    "revision_request_history" JSONB DEFAULT '[]',
    "portfolio_reference_id" INTEGER,
    "portfolio_reference_title" TEXT,
    "portfolio_reference_field" TEXT,
    "portfolio_reference_type" TEXT,
    "portfolio_reference_format" TEXT,
    "portfolio_reference_size" TEXT,
    "portfolio_reference_paper" TEXT,
    "portfolio_reference_printing" TEXT,
    "portfolio_reference_finishing" TEXT,
    "portfolio_reference_image" TEXT,
    "portfolio_reference_url" TEXT,
    "portfolio_reference_info" JSONB,
    "process_stage" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "production_started_at" TIMESTAMP(3),
    "cutting_started_at" TIMESTAMP(3),
    "cutting_completed_at" TIMESTAMP(3),
    "finishing_started_at" TIMESTAMP(3),
    "finishing_completed_at" TIMESTAMP(3),
    "scheduled_auto_complete_at" TIMESTAMP(3),
    "booking_changed_at" TIMESTAMP(3),
    "dxf_classified_count" INTEGER DEFAULT 0,
    "dxf_total_price" INTEGER DEFAULT 0,
    "nesting_sheet_count" INTEGER,
    "nesting_utilization" DOUBLE PRECISION,
    "worker_memo" TEXT,
    "worker_issue" BOOLEAN DEFAULT false,
    "worker_memo_at" TIMESTAMP(3),
    "worker_memo_by" TEXT,
    "webhard_folder_id" TEXT,
    "is_urgent" BOOLEAN DEFAULT false,
    "urgent_at" TIMESTAMP(3),
    "referral_source" TEXT,
    "visit_location" TEXT,
    "inquiry_title" TEXT,
    "service_mold_request" BOOLEAN DEFAULT false,
    "service_delivery_brokerage" BOOLEAN DEFAULT false,
    "attachment_filename" TEXT,
    "attachment_url" TEXT,
    "visit_date" TEXT,
    "visit_time_slot" TEXT,
    "parent_contact_id" UUID,
    "split_index" INTEGER,
    "split_count" INTEGER,
    "stage_completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_status_history" (
    "id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "change_type" VARCHAR(30) NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30),
    "from_stage" VARCHAR(30),
    "to_stage" VARCHAR(30),
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_name" VARCHAR(100),
    "company_name" VARCHAR(200),
    "company_id" INTEGER,
    "source" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_revisions" (
    "id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "process_stage" VARCHAR(30),
    "reason" VARCHAR(30) NOT NULL,
    "reason_detail" TEXT,
    "files" JSONB NOT NULL DEFAULT '[]',
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_name" VARCHAR(100),
    "source" VARCHAR(30) NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawing_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_bookings" (
    "id" BIGSERIAL NOT NULL,
    "visit_date" DATE NOT NULL,
    "visit_time_slot" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_id" UUID,
    "status" TEXT DEFAULT 'confirmed',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "delivery_method" TEXT,
    "delivery_name" TEXT,
    "delivery_phone" TEXT,
    "delivery_address" TEXT,

    CONSTRAINT "visit_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "paper" TEXT NOT NULL,
    "printing" TEXT NOT NULL,
    "finishing" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" BIGINT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "view_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_feedback" (
    "id" BIGSERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "company_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "admin_notes" TEXT,
    "company_email" TEXT,
    "category" TEXT,
    "category_other" TEXT,

    CONSTRAINT "company_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_name" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "details" JSONB DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_companies" (
    "id" BIGSERIAL NOT NULL,
    "company_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_type" VARCHAR(20) NOT NULL,
    "user_id" BIGINT,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "company_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "max_downloads" INTEGER,
    "download_count" INTEGER DEFAULT 0,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_sessions" (
    "id" SERIAL NOT NULL,
    "user_type" VARCHAR(20) NOT NULL DEFAULT 'company',
    "user_id" INTEGER NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "company_name" VARCHAR(200),
    "last_activity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "active_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhard_logs" (
    "id" BIGSERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" BIGINT,
    "company_id" BIGINT,
    "user_id" BIGINT,
    "folder_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhard_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhard_sync_history" (
    "id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "sync_started_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "sync_completed_at" TIMESTAMP(3),
    "sync_type" TEXT NOT NULL,
    "files_added" INTEGER DEFAULT 0,
    "files_updated" INTEGER DEFAULT 0,
    "files_deleted" INTEGER DEFAULT 0,
    "folders_added" INTEGER DEFAULT 0,
    "folders_deleted" INTEGER DEFAULT 0,
    "total_size_bytes" BIGINT DEFAULT 0,
    "sync_status" TEXT DEFAULT 'in_progress',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhard_sync_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhard_sync_state" (
    "id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "last_sync_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_sync_hash" TEXT,
    "files_synced" INTEGER DEFAULT 0,
    "folders_synced" INTEGER DEFAULT 0,
    "sync_type" TEXT DEFAULT 'full',
    "sync_status" TEXT DEFAULT 'completed',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhard_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhard_user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "settings_json" JSONB NOT NULL DEFAULT '{"notifyOnError": true, "downloadFolderPath": "Downloads", "notifyOnUploadComplete": true, "notifyOnDownloadComplete": true}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhard_user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "number_counters" (
    "dateKey" DATE NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "number_counters_pkey" PRIMARY KEY ("dateKey","type")
);

-- CreateTable
CREATE TABLE "backup_logs" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "backup_path" TEXT NOT NULL,
    "company_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_notes" (
    "id" SERIAL NOT NULL,
    "contact_id" UUID NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_username_key" ON "companies"("username");

-- CreateIndex
CREATE INDEX "companies_username_idx" ON "companies"("username");

-- CreateIndex
CREATE INDEX "companies_company_name_idx" ON "companies"("company_name");

-- CreateIndex
CREATE INDEX "companies_business_registration_number_idx" ON "companies"("business_registration_number");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE INDEX "companies_is_approved_idx" ON "companies"("is_approved");

-- CreateIndex
CREATE INDEX "companies_created_at_idx" ON "companies"("created_at" DESC);

-- CreateIndex
CREATE INDEX "webhard_files_folder_id_idx" ON "webhard_files"("folder_id");

-- CreateIndex
CREATE INDEX "webhard_files_company_id_idx" ON "webhard_files"("company_id");

-- CreateIndex
CREATE INDEX "webhard_files_deleted_at_idx" ON "webhard_files"("deleted_at");

-- CreateIndex
CREATE INDEX "webhard_files_company_id_deleted_at_idx" ON "webhard_files"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "webhard_files_folder_id_deleted_at_idx" ON "webhard_files"("folder_id", "deleted_at");

-- CreateIndex
CREATE INDEX "webhard_files_is_downloaded_deleted_at_idx" ON "webhard_files"("is_downloaded", "deleted_at");

-- CreateIndex
CREATE INDEX "webhard_files_name_folder_id_deleted_at_idx" ON "webhard_files"("name", "folder_id", "deleted_at");

-- CreateIndex
CREATE INDEX "webhard_folders_parent_id_idx" ON "webhard_folders"("parent_id");

-- CreateIndex
CREATE INDEX "webhard_folders_company_id_idx" ON "webhard_folders"("company_id");

-- CreateIndex
CREATE INDEX "webhard_folders_path_idx" ON "webhard_folders"("path");

-- CreateIndex
CREATE INDEX "webhard_folders_deleted_at_idx" ON "webhard_folders"("deleted_at");

-- CreateIndex
CREATE INDEX "webhard_folders_name_parent_id_company_id_idx" ON "webhard_folders"("name", "parent_id", "company_id");

-- CreateIndex
CREATE INDEX "webhard_folders_parent_id_deleted_at_idx" ON "webhard_folders"("parent_id", "deleted_at");

-- CreateIndex
CREATE INDEX "machines_type_idx" ON "machines"("type");

-- CreateIndex
CREATE INDEX "machines_status_idx" ON "machines"("status");

-- CreateIndex
CREATE INDEX "tasks_contact_id_idx" ON "tasks"("contact_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_priority_idx" ON "tasks"("priority");

-- CreateIndex
CREATE INDEX "tasks_task_type_idx" ON "tasks"("task_type");

-- CreateIndex
CREATE INDEX "tasks_machine_id_idx" ON "tasks"("machine_id");

-- CreateIndex
CREATE INDEX "tasks_assigned_to_idx" ON "tasks"("assigned_to");

-- CreateIndex
CREATE INDEX "tasks_sort_order_idx" ON "tasks"("sort_order");

-- CreateIndex
CREATE INDEX "tasks_created_at_idx" ON "tasks"("created_at");

-- CreateIndex
CREATE INDEX "tasks_order_id_idx" ON "tasks"("order_id");

-- CreateIndex
CREATE INDEX "tasks_status_priority_sort_order_idx" ON "tasks"("status", "priority", "sort_order");

-- CreateIndex
CREATE INDEX "erp_workers_is_active_idx" ON "erp_workers"("is_active");

-- CreateIndex
CREATE INDEX "erp_workers_role_idx" ON "erp_workers"("role");

-- CreateIndex
CREATE INDEX "worker_access_logs_worker_id_idx" ON "worker_access_logs"("worker_id");

-- CreateIndex
CREATE INDEX "worker_access_logs_created_at_idx" ON "worker_access_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "worker_access_logs_ip_address_idx" ON "worker_access_logs"("ip_address");

-- CreateIndex
CREATE INDEX "orders_contact_id_idx" ON "orders"("contact_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_company_name_idx" ON "orders"("company_name");

-- CreateIndex
CREATE INDEX "orders_inquiry_number_idx" ON "orders"("inquiry_number");

-- CreateIndex
CREATE INDEX "orders_priority_status_idx" ON "orders"("priority", "status");

-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_events_event_type_idx" ON "order_events"("event_type");

-- CreateIndex
CREATE INDEX "order_events_source_idx" ON "order_events"("source");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "program_heartbeats_program_type_instance_name_key" ON "program_heartbeats"("program_type", "instance_name");

-- CreateIndex
CREATE INDEX "deliveries_order_id_idx" ON "deliveries"("order_id");

-- CreateIndex
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");

-- CreateIndex
CREATE INDEX "deliveries_scheduled_date_idx" ON "deliveries"("scheduled_date");

-- CreateIndex
CREATE INDEX "inventory_items_category_idx" ON "inventory_items"("category");

-- CreateIndex
CREATE INDEX "inventory_items_is_active_idx" ON "inventory_items"("is_active");

-- CreateIndex
CREATE INDEX "inventory_items_current_stock_idx" ON "inventory_items"("current_stock");

-- CreateIndex
CREATE INDEX "inventory_transactions_item_id_created_at_idx" ON "inventory_transactions"("item_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_type_idx" ON "inventory_transactions"("type");

-- CreateIndex
CREATE INDEX "inventory_transactions_order_id_idx" ON "inventory_transactions"("order_id");

-- CreateIndex
CREATE INDEX "sync_logs_created_at_idx" ON "sync_logs"("created_at");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");

-- CreateIndex
CREATE INDEX "sync_logs_md5_hash_idx" ON "sync_logs"("md5_hash");

-- CreateIndex
CREATE INDEX "contacts_status_idx" ON "contacts"("status");

-- CreateIndex
CREATE INDEX "contacts_company_name_idx" ON "contacts"("company_name");

-- CreateIndex
CREATE INDEX "contacts_inquiry_number_idx" ON "contacts"("inquiry_number");

-- CreateIndex
CREATE INDEX "contacts_created_at_idx" ON "contacts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "contacts_deleted_at_idx" ON "contacts"("deleted_at");

-- CreateIndex
CREATE INDEX "contacts_source_idx" ON "contacts"("source");

-- CreateIndex
CREATE INDEX "contacts_inquiry_type_idx" ON "contacts"("inquiry_type");

-- CreateIndex
CREATE INDEX "contacts_delivery_method_idx" ON "contacts"("delivery_method");

-- CreateIndex
CREATE INDEX "contacts_work_number_idx" ON "contacts"("work_number");

-- CreateIndex
CREATE INDEX "contacts_original_filename_idx" ON "contacts"("original_filename");

-- CreateIndex
CREATE INDEX "contacts_status_company_name_idx" ON "contacts"("status", "company_name");

-- CreateIndex
CREATE INDEX "contacts_status_created_at_idx" ON "contacts"("status", "created_at");

-- CreateIndex
CREATE INDEX "contacts_is_urgent_urgent_at_idx" ON "contacts"("is_urgent", "urgent_at");

-- CreateIndex
CREATE INDEX "contacts_process_stage_idx" ON "contacts"("process_stage");

-- CreateIndex
CREATE INDEX "contacts_process_stage_status_idx" ON "contacts"("process_stage", "status");

-- CreateIndex
CREATE INDEX "contacts_status_updated_at_idx" ON "contacts"("status", "updated_at");

-- CreateIndex
CREATE INDEX "contacts_parent_contact_id_idx" ON "contacts"("parent_contact_id");

-- CreateIndex
CREATE INDEX "contacts_parent_contact_id_split_index_idx" ON "contacts"("parent_contact_id", "split_index");

-- CreateIndex
CREATE INDEX "contact_status_history_contact_id_created_at_idx" ON "contact_status_history"("contact_id", "created_at");

-- CreateIndex
CREATE INDEX "contact_status_history_contact_id_change_type_idx" ON "contact_status_history"("contact_id", "change_type");

-- CreateIndex
CREATE INDEX "drawing_revisions_contact_id_created_at_idx" ON "drawing_revisions"("contact_id", "created_at");

-- CreateIndex
CREATE INDEX "drawing_revisions_contact_id_version_idx" ON "drawing_revisions"("contact_id", "version");

-- CreateIndex
CREATE INDEX "visit_bookings_visit_date_idx" ON "visit_bookings"("visit_date");

-- CreateIndex
CREATE INDEX "visit_bookings_visit_time_slot_idx" ON "visit_bookings"("visit_time_slot");

-- CreateIndex
CREATE INDEX "visit_bookings_visit_date_visit_time_slot_idx" ON "visit_bookings"("visit_date", "visit_time_slot");

-- CreateIndex
CREATE INDEX "visit_bookings_company_name_idx" ON "visit_bookings"("company_name");

-- CreateIndex
CREATE INDEX "visit_bookings_contact_id_idx" ON "visit_bookings"("contact_id");

-- CreateIndex
CREATE INDEX "visit_bookings_status_idx" ON "visit_bookings"("status");

-- CreateIndex
CREATE INDEX "visit_bookings_delivery_method_idx" ON "visit_bookings"("delivery_method");

-- CreateIndex
CREATE UNIQUE INDEX "visit_bookings_visit_date_visit_time_slot_company_name_cont_key" ON "visit_bookings"("visit_date", "visit_time_slot", "company_name", "contact_id");

-- CreateIndex
CREATE INDEX "portfolio_created_at_idx" ON "portfolio"("created_at" DESC);

-- CreateIndex
CREATE INDEX "company_feedback_company_id_idx" ON "company_feedback"("company_id");

-- CreateIndex
CREATE INDEX "company_feedback_status_idx" ON "company_feedback"("status");

-- CreateIndex
CREATE INDEX "company_feedback_created_at_idx" ON "company_feedback"("created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");

-- CreateIndex
CREATE INDEX "activity_logs_actor_id_idx" ON "activity_logs"("actor_id");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "delivery_companies_company_id_idx" ON "delivery_companies"("company_id");

-- CreateIndex
CREATE INDEX "delivery_companies_created_at_idx" ON "delivery_companies"("created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_type_user_id_created_at_idx" ON "notifications"("user_type", "user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_type_user_id_is_read_idx" ON "notifications"("user_type", "user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at" DESC);

-- CreateIndex
CREATE INDEX "push_subscriptions_worker_id_idx" ON "push_subscriptions"("worker_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_worker_id_endpoint_key" ON "push_subscriptions"("worker_id", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");

-- CreateIndex
CREATE INDEX "share_links_token_idx" ON "share_links"("token");

-- CreateIndex
CREATE INDEX "share_links_company_id_idx" ON "share_links"("company_id");

-- CreateIndex
CREATE INDEX "share_links_expires_at_idx" ON "share_links"("expires_at");

-- CreateIndex
CREATE INDEX "share_links_is_active_idx" ON "share_links"("is_active");

-- CreateIndex
CREATE INDEX "active_sessions_user_type_idx" ON "active_sessions"("user_type");

-- CreateIndex
CREATE INDEX "active_sessions_last_activity_idx" ON "active_sessions"("last_activity");

-- CreateIndex
CREATE UNIQUE INDEX "active_sessions_user_type_user_id_key" ON "active_sessions"("user_type", "user_id");

-- CreateIndex
CREATE INDEX "webhard_logs_action_idx" ON "webhard_logs"("action");

-- CreateIndex
CREATE INDEX "webhard_logs_company_id_idx" ON "webhard_logs"("company_id");

-- CreateIndex
CREATE INDEX "webhard_logs_status_idx" ON "webhard_logs"("status");

-- CreateIndex
CREATE INDEX "webhard_logs_created_at_idx" ON "webhard_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "webhard_sync_history_company_id_sync_started_at_idx" ON "webhard_sync_history"("company_id", "sync_started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webhard_sync_state_company_id_key" ON "webhard_sync_state"("company_id");

-- CreateIndex
CREATE INDEX "webhard_sync_state_company_id_idx" ON "webhard_sync_state"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhard_user_settings_user_id_key" ON "webhard_user_settings"("user_id");

-- CreateIndex
CREATE INDEX "webhard_user_settings_user_id_idx" ON "webhard_user_settings"("user_id");

-- CreateIndex
CREATE INDEX "webhard_user_settings_updated_at_idx" ON "webhard_user_settings"("updated_at");

-- CreateIndex
CREATE INDEX "backup_logs_created_at_idx" ON "backup_logs"("created_at");

-- CreateIndex
CREATE INDEX "backup_logs_status_idx" ON "backup_logs"("status");

-- CreateIndex
CREATE INDEX "backup_logs_file_id_idx" ON "backup_logs"("file_id");

-- CreateIndex
CREATE INDEX "worker_notes_contact_id_idx" ON "worker_notes"("contact_id");

-- AddForeignKey
ALTER TABLE "webhard_files" ADD CONSTRAINT "webhard_files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "webhard_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhard_files" ADD CONSTRAINT "webhard_files_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhard_folders" ADD CONSTRAINT "webhard_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "webhard_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhard_folders" ADD CONSTRAINT "webhard_folders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_access_logs" ADD CONSTRAINT "worker_access_logs_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "erp_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_parent_contact_id_fkey" FOREIGN KEY ("parent_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_status_history" ADD CONSTRAINT "contact_status_history_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_revisions" ADD CONSTRAINT "drawing_revisions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_notes" ADD CONSTRAINT "worker_notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
