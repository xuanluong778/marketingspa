-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'PROBATION');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'PROBATION', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "HrmDocumentType" AS ENUM ('CONTRACT', 'ID_CARD', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentContractType" AS ENUM ('PROBATION', 'FIXED', 'INDEFINITE');

-- CreateEnum
CREATE TYPE "EmploymentContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('QR', 'GPS', 'KIOSK', 'MANUAL');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('OPEN', 'LOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendancePunchType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "AttendanceDayStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "ShiftAssignmentSource" AS ENUM ('POLICY', 'MANUAL', 'SWAP');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'MATERNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveDayPart" AS ENUM ('FULL', 'HALF_AM', 'HALF_PM');

-- CreateEnum
CREATE TYPE "LeadPipelineStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'BOOKED', 'CONFIRMED', 'VISITED', 'PURCHASED', 'LOST');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING', 'PAID', 'PARTIALLY_PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'MOMO', 'ZALOPAY', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('ADVERTISING', 'RENT', 'SALARY', 'SUPPLIES', 'UTILITIES', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('META', 'GOOGLE', 'TIKTOK', 'ZALO', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketingTouchType" AS ENUM ('FIRST', 'LAST');

-- CreateEnum
CREATE TYPE "MarketingFunnelEventType" AS ENUM ('LEAD_CREATED', 'LEAD_QUALIFIED', 'APPOINTMENT_BOOKED', 'APPOINTMENT_CONFIRMED', 'CUSTOMER_ARRIVED', 'SERVICE_PURCHASED', 'PAYMENT_COMPLETED', 'CUSTOMER_RETURNED', 'PAYMENT_REFUNDED', 'APPOINTMENT_CANCELLED');

-- CreateEnum
CREATE TYPE "OfflineConversionProvider" AS ENUM ('META_CAPI', 'GOOGLE_ENHANCED');

-- CreateEnum
CREATE TYPE "OfflineConversionStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS', 'ZALO', 'MESSENGER', 'PUSH');

-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('LEAD_CREATED', 'LEAD_UNTOUCHED', 'LEAD_BOOKED', 'APPOINTMENT_CREATED', 'APPOINTMENT_UNCONFIRMED', 'APPOINTMENT_24H_BEFORE', 'APPOINTMENT_2H_BEFORE', 'APPOINTMENT_REMINDER', 'APPOINTMENT_CANCELLED', 'NO_SHOW', 'BIRTHDAY', 'CUSTOMER_INACTIVE', 'ORDER_COMPLETED', 'TREATMENT_EXPIRING', 'MANUAL');

-- CreateEnum
CREATE TYPE "CrmTaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeadAssignmentMode" AS ENUM ('BRANCH', 'EMPLOYEE', 'ROUND_ROBIN');

-- CreateEnum
CREATE TYPE "AppointmentDepositStatus" AS ENUM ('NONE', 'PENDING', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AutomationLogStatus" AS ENUM ('PENDING', 'RUNNING', 'SENT', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('META_ADS', 'GOOGLE_ADS', 'ZALO_OA', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'ACTIVE', 'EXPIRED', 'REAUTH_REQUIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "FacebookAdsConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'SYNCING', 'TOKEN_EXPIRED', 'NO_AD_ACCOUNT_ACCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "FacebookAdsSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AdConnectionProvider" AS ENUM ('META', 'GOOGLE', 'GMAIL');

-- CreateEnum
CREATE TYPE "AdConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'TOKEN_EXPIRED', 'INSUFFICIENT_PERMISSIONS', 'ERROR');

-- CreateEnum
CREATE TYPE "AdsSyncJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdsSyncPlatform" AS ENUM ('META', 'GOOGLE');

-- CreateEnum
CREATE TYPE "AdAutomationRuleType" AS ENUM ('PAUSE_SPEND_NO_CONVERSION', 'PAUSE_CPA_THRESHOLD', 'PAUSE_ROAS_THRESHOLD', 'ALERT_CTR_LOW', 'ALERT_CPM_HIGH', 'ALERT_CPA_INCREASE', 'ALERT_ROAS_DROP', 'ALERT_CPC_HIGH', 'ADJUST_BUDGET_UP_ROAS', 'ADJUST_BUDGET_DOWN_CPA');

-- CreateEnum
CREATE TYPE "AdAutomationAction" AS ENUM ('PAUSE', 'ENABLE', 'ALERT', 'RECOMMEND');

-- CreateEnum
CREATE TYPE "AdDraftStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdsActionRequestStatus" AS ENUM ('PROPOSED', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'QUEUED', 'EXECUTING', 'VERIFYING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED', 'SKIPPED_DISABLED');

-- CreateEnum
CREATE TYPE "AffiliateProfileStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "AffiliateCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'AVAILABLE', 'PAYOUT_PENDING', 'PAID', 'REJECTED', 'REVERSED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "AffiliatePayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AffiliateFraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AdsActionType" AS ENUM ('PAUSE_CAMPAIGN', 'ENABLE_CAMPAIGN', 'ADJUST_BUDGET', 'PUBLISH_DRAFT', 'UPDATE_STATUS');

-- CreateEnum
CREATE TYPE "AdsActionSource" AS ENUM ('AI', 'HUMAN', 'RULE');

-- CreateEnum
CREATE TYPE "AdEmailReportSchedule" AS ENUM ('DAILY', 'WEEKLY', 'ON_ALERT');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'TRIAL_EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChatbotBotStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "ChatbotChannelType" AS ENUM ('WEBSITE_WIDGET', 'FACEBOOK', 'ZALO', 'TELEGRAM', 'API');

-- CreateEnum
CREATE TYPE "ChatbotChannelStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ChatbotSourceType" AS ENUM ('FAQ', 'URL', 'FILE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ChatbotConversationStatus" AS ENUM ('OPEN', 'CLOSED', 'NEEDS_STAFF');

-- CreateEnum
CREATE TYPE "ChatbotLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "MessagingFollowStatus" AS ENUM ('UNKNOWN', 'FOLLOWING', 'UNFOLLOWED');

-- CreateEnum
CREATE TYPE "MessagingConsentStatus" AS ENUM ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT', 'PENDING');

-- CreateEnum
CREATE TYPE "MessagingIdentityLinkSource" AS ENUM ('UNLINKED', 'MANUAL', 'PHONE_VERIFIED', 'LEAD_ID', 'CUSTOMER_ID', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageTemplateApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MessagingChannelAccountStatus" AS ENUM ('DISCONNECTED', 'ACTIVE', 'EXPIRED', 'REAUTH_REQUIRED', 'ERROR', 'PAUSED');

-- CreateEnum
CREATE TYPE "MessagingProviderKind" AS ENUM ('MESSENGER', 'ZALO_OA', 'ZBS_TEMPLATE');

-- CreateEnum
CREATE TYPE "MessagingCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PLANNING', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "MessagingCampaignKind" AS ENUM ('AUTOMATION', 'BROADCAST', 'TRANSACTIONAL', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "MessagingCampaignRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'REPLIED', 'FAILED', 'SKIPPED', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "MessagingSuppressionReason" AS ENUM ('BLOCKED', 'OPTED_OUT', 'MANUAL', 'BOUNCE');

-- CreateEnum
CREATE TYPE "AutoPostStatus" AS ENUM ('DRAFT', 'PENDING', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutoPostType" AS ENUM ('SPA_SALES', 'BRAND_BUILDING', 'CUSTOMER_FEEDBACK', 'PROMOTION', 'BEAUTY_KNOWLEDGE', 'OLD_CUSTOMER_CARE', 'OPENING_EVENT', 'INBOX_BOOKING');

-- CreateEnum
CREATE TYPE "AutoPostFacebookConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'TOKEN_EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "VideoTranscriptionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoTranscriptionStage" AS ENUM ('QUEUED', 'VALIDATING', 'EXTRACTING_AUDIO', 'TRANSCRIBING', 'CLEANING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoTranscriptionSourceType" AS ENUM ('UPLOAD', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "AutoPostMetaDeletionStatus" AS ENUM ('PENDING', 'COMPLETED', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "referred_by_code" TEXT,
    "referred_by_affiliate_id" TEXT,
    "referral_locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "google_sub" TEXT,
    "auth_provider" TEXT NOT NULL DEFAULT 'LOCAL',
    "organization_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "email_verified_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "target_user_id" TEXT,
    "response_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "department_id" TEXT,
    "manager_id" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "position" TEXT,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "avatar_url" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "legal_id_number" TEXT,
    "address" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "hired_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_contracts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "employee_id" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "contract_type" "EmploymentContractType" NOT NULL DEFAULT 'FIXED',
    "status" "EmploymentContractStatus" NOT NULL DEFAULT 'DRAFT',
    "salary_base" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "file_url" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_contract_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "employee_id" TEXT NOT NULL,
    "type" "HrmDocumentType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_key" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "issued_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "uploaded_by_id" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_account_invites" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_account_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_shift_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "start_time" TEXT NOT NULL DEFAULT '08:00',
    "end_time" TEXT NOT NULL DEFAULT '17:00',
    "break_minutes" INTEGER NOT NULL DEFAULT 60,
    "late_grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_leave_grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "ot_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "ot_after_minutes" INTEGER NOT NULL DEFAULT 0,
    "crosses_midnight" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_shift_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_shift_policy_versions" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_shift_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "policy_id" TEXT,
    "work_date" DATE NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "source" "ShiftAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_qr_tokens" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_qr_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "punched_at" TIMESTAMP(3) NOT NULL,
    "type" "AttendancePunchType" NOT NULL,
    "method" "AttendanceMethod" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_m" DOUBLE PRECISION,
    "qr_token_id" TEXT,
    "kiosk_device_id" TEXT,
    "raw_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_periods" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'OPEN',
    "locked_at" TIMESTAMP(3),
    "locked_by_id" TEXT,
    "unlock_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "check_in_at" TIMESTAMP(3),
    "check_out_at" TIMESTAMP(3),
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_leave_minutes" INTEGER NOT NULL DEFAULT 0,
    "ot_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceDayStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "timesheet_period_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_adjustments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "timesheet_period_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "employee_id" TEXT NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "day_part" "LeaveDayPart" NOT NULL DEFAULT 'FULL',
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "attachment_url" TEXT,
    "attachment_key" TEXT,
    "attachment_name" TEXT,
    "attachment_mime" TEXT,
    "attachment_size" INTEGER,
    "approver_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approver_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_sources" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funnel_stages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" "LeadPipelineStatus",
    "position" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_lost_stage" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funnel_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "lead_source_id" TEXT,
    "assigned_employee_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "birthday" DATE,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "merged_into_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "lead_source_id" TEXT,
    "funnel_stage_id" TEXT,
    "assigned_to_id" TEXT,
    "customer_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "pipeline_status" "LeadPipelineStatus" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "estimated_value" DECIMAL(12,2),
    "lost_reason" TEXT,
    "converted_at" TIMESTAMP(3),
    "platform_external_lead_id" TEXT,
    "platform" "AdPlatform",
    "score" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sla_respond_by" TIMESTAMP(3),
    "sla_breached" BOOLEAN NOT NULL DEFAULT false,
    "last_contacted_at" TIMESTAMP(3),
    "reminder_at" TIMESTAMP(3),
    "claimed_by_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "claim_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "employee_id" TEXT,
    "service_id" TEXT,
    "room_id" TEXT,
    "bed_id" TEXT,
    "equipment_id" TEXT,
    "ad_campaign_id" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT,
    "deposit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit_status" "AppointmentDepositStatus" NOT NULL DEFAULT 'NONE',
    "checked_in_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,
    "no_show_reason" TEXT,
    "rescheduled_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spa_rooms" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spa_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spa_beds" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spa_beds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spa_equipments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spa_equipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_notes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "author_user_id" TEXT,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_saved_views" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "view_mode" TEXT NOT NULL DEFAULT 'kanban',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "table_columns" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "customer_id" TEXT,
    "assignee_id" TEXT,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "status" "CrmTaskStatus" NOT NULL DEFAULT 'OPEN',
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_merge_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "primary_id" TEXT NOT NULL,
    "secondary_id" TEXT NOT NULL,
    "merged_by_user_id" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_merge_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_assignment_rules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "mode" "LeadAssignmentMode" NOT NULL DEFAULT 'ROUND_ROBIN',
    "employee_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_index" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "order_number" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "ordered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "service_id" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "ad_campaign_id" TEXT,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "expense_date" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "name" TEXT NOT NULL,
    "external_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "budget" DECIMAL(12,2),
    "start_date" DATE,
    "end_date" DATE,
    "external_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_daily_stats" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ad_campaign_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "conversions" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "conversion_value" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "ctr" DECIMAL(18,8),
    "cpc" DECIMAL(18,8),
    "cpm" DECIMAL(18,8),
    "cpa" DECIMAL(18,8),
    "roas" DECIMAL(18,8),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "conversion_actions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_sets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "ad_campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "external_id" TEXT,
    "keyword" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_creatives" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "ad_campaign_id" TEXT NOT NULL,
    "ad_set_id" TEXT,
    "name" TEXT NOT NULL,
    "external_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_attributions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "channel" "AdPlatform",
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "utm_term" TEXT,
    "fbclid" TEXT,
    "gclid" TEXT,
    "ad_campaign_id" TEXT,
    "ad_set_id" TEXT,
    "ad_id" TEXT,
    "external_campaign_id" TEXT,
    "external_ad_set_id" TEXT,
    "external_ad_id" TEXT,
    "landing_page" TEXT,
    "referrer" TEXT,
    "first_touch_json" JSONB,
    "last_touch_json" JSONB,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_funnel_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_type" "MarketingFunnelEventType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lead_id" TEXT,
    "customer_id" TEXT,
    "appointment_id" TEXT,
    "order_id" TEXT,
    "payment_id" TEXT,
    "branch_id" TEXT,
    "employee_id" TEXT,
    "service_id" TEXT,
    "ad_campaign_id" TEXT,
    "amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "idempotency_key" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_funnel_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_conversion_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" "OfflineConversionProvider" NOT NULL,
    "status" "OfflineConversionStatus" NOT NULL DEFAULT 'PENDING',
    "event_type" "MarketingFunnelEventType" NOT NULL,
    "funnel_event_id" TEXT,
    "lead_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_conversion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "campaign_kind" "MessagingCampaignKind",
    "provider_mode" TEXT,
    "provider_template_id" TEXT,
    "approval_status" "MessageTemplateApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "media_url" TEXT,
    "cta_label" TEXT,
    "cta_url" TEXT,
    "variable_fallbacks" JSONB NOT NULL DEFAULT '{}',
    "content_blocks" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_org_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "quiet_hours_start" TEXT,
    "quiet_hours_end" TEXT,
    "max_messages_per_recipient_per_day" INTEGER NOT NULL DEFAULT 3,
    "campaign_cooldown_minutes" INTEGER NOT NULL DEFAULT 1440,
    "channel_rate_limits" JSONB NOT NULL DEFAULT '{}',
    "exclude_recently_manual_messaged" BOOLEAN NOT NULL DEFAULT true,
    "manual_message_lookback_minutes" INTEGER NOT NULL DEFAULT 60,
    "stop_on_reply" BOOLEAN NOT NULL DEFAULT true,
    "stop_on_opt_out" BOOLEAN NOT NULL DEFAULT true,
    "create_task_on_reply" BOOLEAN NOT NULL DEFAULT true,
    "assign_employee_on_reply" BOOLEAN NOT NULL DEFAULT false,
    "handover_to_chatbot_on_reply" BOOLEAN NOT NULL DEFAULT true,
    "opt_out_keywords" JSONB NOT NULL DEFAULT '["STOP","DUNG","HUY","UNSUBSCRIBE","OPT OUT"]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_org_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_flows" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "message_template_id" TEXT,
    "name" TEXT NOT NULL,
    "trigger_type" "AutomationTriggerType" NOT NULL,
    "channel" "MessageChannel",
    "delay_minutes" INTEGER NOT NULL DEFAULT 0,
    "trigger_config" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" TEXT,
    "quiet_hours_end" TEXT,
    "max_sends_per_day" INTEGER,
    "cooldown_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "automation_flow_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "appointment_id" TEXT,
    "channel" "MessageChannel",
    "rendered_content" TEXT,
    "status" "AutomationLogStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "step_index" INTEGER NOT NULL DEFAULT 0,
    "step_name" TEXT,
    "idempotency_key" TEXT,
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "encrypted_credentials" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_tested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_contact_identities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "integration_id" TEXT,
    "integration_scope_key" TEXT NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "external_conversation_id" TEXT,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "phone_raw" TEXT,
    "phone_normalized" TEXT,
    "phone_verified_at" TIMESTAMP(3),
    "follow_status" "MessagingFollowStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consent_status" "MessagingConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "opted_out" BOOLEAN NOT NULL DEFAULT false,
    "link_source" "MessagingIdentityLinkSource" NOT NULL DEFAULT 'UNLINKED',
    "last_inbound_at" TIMESTAMP(3),
    "last_outbound_at" TIMESTAMP(3),
    "merged_into_id" TEXT,
    "chatbot_conversation_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_contact_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_identity_merge_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "primary_identity_id" TEXT NOT NULL,
    "merged_identity_ids" TEXT[],
    "merged_by_user_id" TEXT,
    "snapshot" JSONB NOT NULL,
    "undone_at" TIMESTAMP(3),
    "undone_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_identity_merge_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_channel_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "provider_kind" "MessagingProviderKind" NOT NULL,
    "account_ref" TEXT NOT NULL,
    "display_name" TEXT,
    "encrypted_credentials" TEXT,
    "status" "MessagingChannelAccountStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "token_expires_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "last_tested_at" TIMESTAMP(3),
    "webhook_subscribed" BOOLEAN NOT NULL DEFAULT false,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_channel_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_webhook_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "event_key" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "messaging_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_campaigns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "campaign_type" "MessagingCampaignKind" NOT NULL,
    "channel_connection_id" TEXT,
    "integration_id" TEXT,
    "message_template_id" TEXT,
    "status" "MessagingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "segment_config" JSONB NOT NULL DEFAULT '{}',
    "segment_snapshot" JSONB,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "scheduled_at" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "eligible_count" INTEGER NOT NULL DEFAULT 0,
    "excluded_count" INTEGER NOT NULL DEFAULT 0,
    "queued_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "read_count" INTEGER NOT NULL DEFAULT 0,
    "replied_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "opt_out_count" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actual_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_campaign_recipients" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "identity_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "eligible" BOOLEAN NOT NULL DEFAULT false,
    "exclusion_reason" TEXT,
    "provider_mode" TEXT,
    "rendered_content" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "status" "MessagingCampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "queued_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_suppressions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel" "MessageChannel",
    "identity_id" TEXT,
    "phone_normalized" TEXT,
    "external_user_id" TEXT,
    "channel_account_ref" TEXT,
    "reason" "MessagingSuppressionReason" NOT NULL,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_ads_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "connected_by_user_id" TEXT NOT NULL,
    "selected_ad_account_id" TEXT,
    "selected_ad_account_name" TEXT,
    "facebook_user_id" TEXT,
    "status" "FacebookAdsConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" "FacebookAdsSyncStatus",
    "last_sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_ads_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_ads_sync_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "sync_started_at" TIMESTAMP(3) NOT NULL,
    "sync_finished_at" TIMESTAMP(3),
    "status" "FacebookAdsSyncStatus" NOT NULL,
    "error_message" TEXT,
    "campaigns_synced" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "facebook_ads_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_ads_campaign_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "campaign_name" TEXT NOT NULL,
    "objective" TEXT,
    "campaign_type" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "spend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "frequency" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "cpm" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "cpc" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ctr" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "results" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_per_result" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "purchase_roas" DECIMAL(14,4),
    "result_rate" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_ads_campaign_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "channel" "MessageChannel" NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_customers" (
    "campaign_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,

    CONSTRAINT "campaign_customers_pkey" PRIMARY KEY ("campaign_id","customer_id")
);

-- CreateTable
CREATE TABLE "ai_reports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip_address" TEXT,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization_name" TEXT NOT NULL,
    "organization_slug" TEXT,
    "referral_code" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "consumed_at" TIMESTAMP(3),
    "invalidated_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_monthly" DECIMAL(12,2) NOT NULL,
    "price_vnd" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "duration_months" INTEGER NOT NULL DEFAULT 1,
    "highlight_label" TEXT,
    "savings_amount" DECIMAL(14,0),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "credits_included" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'EXPIRED',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "trial_started_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trial_days" INTEGER NOT NULL DEFAULT 3,
    "allowed_feature_prefixes" JSONB NOT NULL DEFAULT '["content-marketing","auto-post","video-transcriptions"]',
    "ai_daily_quota" INTEGER NOT NULL DEFAULT 30,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_claims" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "email_normalized" TEXT NOT NULL,
    "phone_normalized" TEXT,
    "device_fingerprint_hash" TEXT,
    "ip_hash" TEXT,
    "activated_at" TIMESTAMP(3) NOT NULL,
    "trial_ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "amount_vnd" DECIMAL(14,0) NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "transfer_content" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "qr_url" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "sepay_transaction_id" TEXT NOT NULL,
    "payment_order_id" TEXT,
    "organization_id" TEXT,
    "amount_vnd" DECIMAL(14,0) NOT NULL,
    "account_number" TEXT,
    "gateway" TEXT,
    "content" TEXT,
    "transfer_type" TEXT NOT NULL,
    "reference_code" TEXT,
    "raw_payload" JSONB NOT NULL,
    "auth_method" TEXT,
    "auth_verified" BOOLEAN NOT NULL DEFAULT false,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "matched_reason" TEXT,
    "processing_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_wallets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_goal_scenarios" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "average_revenue_per_transaction" DECIMAL(14,2) NOT NULL,
    "current_transaction_count" INTEGER NOT NULL,
    "variable_cost_rate" DECIMAL(5,2) NOT NULL,
    "fixed_cost" DECIMAL(14,2) NOT NULL,
    "lead_conversion_rate" DECIMAL(5,2) NOT NULL,
    "target_profit" DECIMAL(14,2) NOT NULL,
    "calculated_revenue" DECIMAL(14,2) NOT NULL,
    "calculated_gross_profit" DECIMAL(14,2) NOT NULL,
    "calculated_net_profit" DECIMAL(14,2) NOT NULL,
    "break_even_transactions" INTEGER,
    "break_even_leads" INTEGER,
    "target_transactions" INTEGER,
    "target_leads" INTEGER,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_goal_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_bots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_name" TEXT NOT NULL,
    "website_url" TEXT,
    "business_name" TEXT,
    "industry" TEXT,
    "hotline" TEXT,
    "main_services" TEXT,
    "consultation_tone" TEXT NOT NULL DEFAULT 'friendly',
    "greeting" VARCHAR(500),
    "allowed_domains" VARCHAR(2000),
    "status" "ChatbotBotStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_knowledge_sources" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "source_type" "ChatbotSourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "url" VARCHAR(2000),
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "crawl_error" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_channels" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT,
    "name" TEXT NOT NULL,
    "channel_type" "ChatbotChannelType" NOT NULL,
    "status" "ChatbotChannelStatus" NOT NULL DEFAULT 'PENDING',
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_conversations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "visitor_name" TEXT,
    "visitor_phone" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'website',
    "external_user_id" TEXT,
    "channel_ref" TEXT,
    "status" "ChatbotConversationStatus" NOT NULL DEFAULT 'OPEN',
    "human_takeover" BOOLEAN NOT NULL DEFAULT false,
    "assigned_employee_id" TEXT,
    "linked_lead_id" TEXT,
    "last_user_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_leads" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "need" TEXT,
    "page_url" VARCHAR(2000),
    "status" "ChatbotLeadStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_usage" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT,
    "month" VARCHAR(7) NOT NULL,
    "ai_replies" INTEGER NOT NULL DEFAULT 0,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_org_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "system_prompt" TEXT,
    "greeting" VARCHAR(500),
    "fallback_reply" TEXT,
    "monthly_limit" INTEGER NOT NULL DEFAULT 1000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_org_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_facebook_pages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "page_access_token_encrypted" TEXT NOT NULL,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "webhook_subscribed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_facebook_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" "AdConnectionProvider" NOT NULL,
    "status" "AdConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "encrypted_credentials" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "external_account_id" TEXT,
    "external_account_name" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads_sync_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "platform" "AdsSyncPlatform" NOT NULL DEFAULT 'META',
    "status" "AdsSyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "progress_message" TEXT,
    "campaigns_synced" INTEGER NOT NULL DEFAULT 0,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "bull_job_id" TEXT,
    "locked_at" TIMESTAMP(3),
    "lock_owner" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "requested_by_user_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ads_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_manager_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_manager_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_manager_campaigns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "budget" DECIMAL(14,2),
    "objective" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_manager_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "platform" "AdPlatform" NOT NULL,
    "external_campaign_id" TEXT NOT NULL,
    "campaign_name" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "date" DATE,
    "spend" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "conversion_value" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DECIMAL(18,8),
    "cpc" DECIMAL(18,8),
    "cpm" DECIMAL(18,8),
    "reach" INTEGER NOT NULL DEFAULT 0,
    "frequency" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "conversions" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "leads" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "cpa" DECIMAL(18,8),
    "cpl" DECIMAL(18,8),
    "roas" DECIMAL(18,8),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "conversion_actions" JSONB NOT NULL DEFAULT '[]',
    "efficiency_score" INTEGER,
    "ai_suggestion" TEXT,
    "raw_metrics" JSONB NOT NULL DEFAULT '{}',
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_manager_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "auto_mode_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mcp_mode" TEXT NOT NULL DEFAULT 'SUGGEST',
    "daily_budget_limit" DECIMAL(14,2),
    "max_toggles_per_day" INTEGER NOT NULL DEFAULT 10,
    "toggles_today" INTEGER NOT NULL DEFAULT 0,
    "toggles_reset_date" DATE,
    "max_budget_change_percent" INTEGER NOT NULL DEFAULT 20,
    "rule_lookback_days" INTEGER NOT NULL DEFAULT 7,
    "rule_cooldown_minutes" INTEGER NOT NULL DEFAULT 60,
    "min_spend_for_action" DECIMAL(14,2),
    "emergency_stop" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_manager_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_automation_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" "AdAutomationRuleType" NOT NULL,
    "platform" "AdPlatform",
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" DECIMAL(14,4),
    "spend_threshold" DECIMAL(14,2),
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_automation_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "campaign_id" TEXT,
    "platform" "AdPlatform" NOT NULL,
    "external_campaign_id" TEXT,
    "campaign_name" TEXT,
    "action" "AdAutomationAction" NOT NULL,
    "auto_mode" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_automation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_ai_recommendations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "platform" "AdPlatform",
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_ai_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_email_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule" "AdEmailReportSchedule" NOT NULL DEFAULT 'DAILY',
    "recipient_email" TEXT NOT NULL,
    "report_on_loss" BOOLEAN NOT NULL DEFAULT true,
    "report_on_low_roas" BOOLEAN NOT NULL DEFAULT true,
    "report_on_auto_pause" BOOLEAN NOT NULL DEFAULT true,
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_email_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "status" "AdDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "objective" TEXT,
    "budget" DECIMAL(14,2),
    "audience" TEXT,
    "content" TEXT,
    "headline" TEXT,
    "cta" TEXT,
    "landing_page" TEXT,
    "creative" JSONB NOT NULL DEFAULT '{}',
    "ai_generated" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads_action_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "campaign_id" TEXT,
    "draft_id" TEXT,
    "recommendation_id" TEXT,
    "platform" "AdPlatform" NOT NULL,
    "action_type" "AdsActionType" NOT NULL,
    "source" "AdsActionSource" NOT NULL DEFAULT 'HUMAN',
    "status" "AdsActionRequestStatus" NOT NULL DEFAULT 'PROPOSED',
    "before_state" JSONB NOT NULL DEFAULT '{}',
    "after_state" JSONB NOT NULL DEFAULT '{}',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "reason" TEXT,
    "rejection_reason" TEXT,
    "budget_limit" DECIMAL(18,6),
    "proposed_budget" DECIMAL(18,6),
    "idempotency_key" TEXT NOT NULL,
    "bull_job_id" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "provider_write_enabled" BOOLEAN NOT NULL DEFAULT false,
    "proposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ads_action_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_post_facebook_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "facebook_user_id" TEXT,
    "facebook_user_name" TEXT,
    "status" "AutoPostFacebookConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_post_facebook_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_post_facebook_pages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "page_picture_url" TEXT,
    "encrypted_page_access_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_post_facebook_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_post_facebook_oauth_pending_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "facebook_user_id" TEXT,
    "facebook_user_name" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_post_facebook_oauth_pending_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_posts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "fanpage_id" TEXT,
    "fanpage_page_id" TEXT,
    "fanpage_name" TEXT,
    "post_type" "AutoPostType" NOT NULL,
    "topic" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "image_url" TEXT,
    "link_url" TEXT,
    "hashtags" TEXT,
    "cta" TEXT,
    "spa_service" TEXT,
    "industry_id" TEXT,
    "industry_name" TEXT,
    "custom_industry" TEXT,
    "target_audience" TEXT,
    "tone" TEXT,
    "promotion" TEXT,
    "status" "AutoPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "facebook_post_id" TEXT,
    "error_message" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_industries" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_industries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_marketing_preferences" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "industry_id" TEXT,
    "custom_industry" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_marketing_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_opinion_voice_profiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "pronoun" VARCHAR(40),
    "preferred_words" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avoid_words" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "opening_phrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "closing_phrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sample_paragraph" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_opinion_voice_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_transcriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "VideoTranscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "stage" "VideoTranscriptionStage" NOT NULL DEFAULT 'QUEUED',
    "source_type" "VideoTranscriptionSourceType" NOT NULL,
    "source_url" VARCHAR(2000),
    "original_filename" VARCHAR(500),
    "language" VARCHAR(16) NOT NULL DEFAULT 'auto',
    "ownership_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "glossary_terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raw_transcript" TEXT,
    "cleaned_transcript" TEXT,
    "corrected_transcript" TEXT,
    "quality_meta" JSONB,
    "duration_seconds" INTEGER,
    "audio_duration_seconds" DOUBLE PRECISION,
    "processed_duration_seconds" DOUBLE PRECISION,
    "chunk_count" INTEGER,
    "chunks_completed" INTEGER,
    "chunk_progress" JSONB,
    "file_size_bytes" BIGINT,
    "detected_language" VARCHAR(16),
    "error_code" VARCHAR(80),
    "error_message" TEXT,
    "bull_job_id" VARCHAR(120),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "temp_dir" VARCHAR(1000),
    "work_dir_relative" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "video_transcriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_transcription_glossaries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_transcription_glossaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_teleprompter_sources" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_content_id" VARCHAR(120),
    "source_type" VARCHAR(40) NOT NULL,
    "source_route" VARCHAR(500),
    "source_title" VARCHAR(500) NOT NULL,
    "original_script" TEXT NOT NULL,
    "edited_script" TEXT NOT NULL,
    "video_hook" TEXT,
    "facebook_post" TEXT,
    "estimated_duration" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_teleprompter_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_post_api_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT,
    "action" TEXT NOT NULL,
    "status_code" INTEGER,
    "error_code" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_post_api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_post_publish_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "facebook_post_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_post_publish_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_post_meta_data_deletion_requests" (
    "id" TEXT NOT NULL,
    "confirmation_code" TEXT NOT NULL,
    "facebook_user_id" TEXT NOT NULL,
    "status" "AutoPostMetaDeletionStatus" NOT NULL DEFAULT 'PENDING',
    "user_ids_affected" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organization_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "posts_anonymized" INTEGER NOT NULL DEFAULT 0,
    "pages_removed" INTEGER NOT NULL DEFAULT 0,
    "scheduled_cancelled" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_post_meta_data_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_post_meta_deauthorize_events" (
    "id" TEXT NOT NULL,
    "facebook_user_id" TEXT NOT NULL,
    "issued_at" INTEGER NOT NULL,
    "user_ids_affected" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pages_removed" INTEGER NOT NULL DEFAULT 0,
    "jobs_cancelled" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_post_meta_deauthorize_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_post_facebook_oauth_states" (
    "id" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_post_facebook_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_knowledge_bases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" VARCHAR(1000),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rag_knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_kb_documents" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "url" VARCHAR(2000),
    "content" TEXT NOT NULL,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "embedding_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rag_kb_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "AffiliateProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "custom_rate" DECIMAL(5,4),
    "allow_renewal_commission" BOOLEAN NOT NULL DEFAULT false,
    "total_clicks" INTEGER NOT NULL DEFAULT 0,
    "total_signups" INTEGER NOT NULL DEFAULT 0,
    "total_paid_refs" INTEGER NOT NULL DEFAULT 0,
    "pending_amount" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "available_amount" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "tax_id" TEXT,
    "tax_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_clicks" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "fingerprint_hash" TEXT,
    "landing_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_referrals" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "referred_organization_id" TEXT NOT NULL,
    "referred_user_id" TEXT,
    "referral_code" TEXT NOT NULL,
    "first_order_only" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_paid_at" TIMESTAMP(3),

    CONSTRAINT "affiliate_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_commissions" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_code" TEXT NOT NULL,
    "sepay_transaction_id" TEXT,
    "organization_id" TEXT NOT NULL,
    "gross_amount_vnd" DECIMAL(14,0) NOT NULL,
    "net_amount_vnd" DECIMAL(14,0) NOT NULL,
    "rate" DECIMAL(5,4) NOT NULL,
    "commission_vnd" DECIMAL(14,0) NOT NULL,
    "status" "AffiliateCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "is_upgrade" BOOLEAN NOT NULL DEFAULT false,
    "is_renewal" BOOLEAN NOT NULL DEFAULT false,
    "hold_until" TIMESTAMP(3) NOT NULL,
    "available_at" TIMESTAMP(3),
    "payout_request_id" TEXT,
    "reject_reason" TEXT,
    "reverse_reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_payout_methods" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "branch_name" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_payout_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_payout_requests" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "amount_vnd" DECIMAL(14,0) NOT NULL,
    "status" "AffiliatePayoutStatus" NOT NULL DEFAULT 'PENDING',
    "bank_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "tax_id" TEXT,
    "note" TEXT,
    "reject_reason" TEXT,
    "paid_at" TIMESTAMP(3),
    "paid_reference" TEXT,
    "reviewed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_fraud_signals" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT,
    "organization_id" TEXT,
    "signal_type" TEXT NOT NULL,
    "severity" "AffiliateFraudSeverity" NOT NULL DEFAULT 'MEDIUM',
    "details" JSONB NOT NULL DEFAULT '{}',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_fraud_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "default_commission_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.30,
    "hold_days" INTEGER NOT NULL DEFAULT 14,
    "min_payout_vnd" DECIMAL(14,0) NOT NULL DEFAULT 500000,
    "cookie_days" INTEGER NOT NULL DEFAULT 30,
    "first_order_only_default" BOOLEAN NOT NULL DEFAULT true,
    "allow_renewal_commission" BOOLEAN NOT NULL DEFAULT false,
    "public_base_url" TEXT NOT NULL DEFAULT 'https://marketingautoaz.com',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_audit_logs" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_referred_by_affiliate_id_idx" ON "organizations"("referred_by_affiliate_id");

-- CreateIndex
CREATE INDEX "organizations_referred_by_code_idx" ON "organizations"("referred_by_code");

-- CreateIndex
CREATE INDEX "branches_organization_id_idx" ON "branches"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_code_key" ON "branches"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE INDEX "roles_organization_id_idx" ON "roles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_code_key" ON "roles"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_idempotency_keys_key_key" ON "admin_idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "admin_idempotency_keys_action_target_user_id_idx" ON "admin_idempotency_keys"("action", "target_user_id");

-- CreateIndex
CREATE INDEX "employees_organization_id_idx" ON "employees"("organization_id");

-- CreateIndex
CREATE INDEX "employees_branch_id_idx" ON "employees"("branch_id");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "employees_organization_id_status_idx" ON "employees"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_code_key" ON "employees"("organization_id", "code");

-- CreateIndex
CREATE INDEX "departments_organization_id_idx" ON "departments"("organization_id");

-- CreateIndex
CREATE INDEX "departments_branch_id_idx" ON "departments"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_code_key" ON "departments"("organization_id", "code");

-- CreateIndex
CREATE INDEX "employment_contracts_organization_id_employee_id_idx" ON "employment_contracts"("organization_id", "employee_id");

-- CreateIndex
CREATE INDEX "employment_contracts_employee_id_status_idx" ON "employment_contracts"("employee_id", "status");

-- CreateIndex
CREATE INDEX "employee_documents_organization_id_employee_id_idx" ON "employee_documents"("organization_id", "employee_id");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_type_idx" ON "employee_documents"("employee_id", "type");

-- CreateIndex
CREATE INDEX "employee_account_invites_organization_id_employee_id_idx" ON "employee_account_invites"("organization_id", "employee_id");

-- CreateIndex
CREATE INDEX "employee_account_invites_token_hash_idx" ON "employee_account_invites"("token_hash");

-- CreateIndex
CREATE INDEX "work_shift_policies_organization_id_branch_id_idx" ON "work_shift_policies"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_shift_policies_organization_id_code_key" ON "work_shift_policies"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "work_shift_policy_versions_policy_id_version_key" ON "work_shift_policy_versions"("policy_id", "version");

-- CreateIndex
CREATE INDEX "shift_assignments_organization_id_branch_id_work_date_idx" ON "shift_assignments"("organization_id", "branch_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_organization_id_employee_id_work_date_key" ON "shift_assignments"("organization_id", "employee_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_qr_tokens_organization_id_branch_id_idx" ON "attendance_qr_tokens"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "attendance_qr_tokens_token_hash_idx" ON "attendance_qr_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "attendance_punches_organization_id_employee_id_work_date_idx" ON "attendance_punches"("organization_id", "employee_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_punches_organization_id_branch_id_punched_at_idx" ON "attendance_punches"("organization_id", "branch_id", "punched_at");

-- CreateIndex
CREATE INDEX "timesheet_periods_organization_id_year_month_idx" ON "timesheet_periods"("organization_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_periods_organization_id_branch_id_year_month_key" ON "timesheet_periods"("organization_id", "branch_id", "year", "month");

-- CreateIndex
CREATE INDEX "attendance_days_organization_id_branch_id_work_date_idx" ON "attendance_days"("organization_id", "branch_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_days_timesheet_period_id_idx" ON "attendance_days"("timesheet_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_organization_id_employee_id_work_date_key" ON "attendance_days"("organization_id", "employee_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_adjustments_organization_id_timesheet_period_id_idx" ON "attendance_adjustments"("organization_id", "timesheet_period_id");

-- CreateIndex
CREATE INDEX "attendance_adjustments_employee_id_work_date_idx" ON "attendance_adjustments"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "leave_requests_organization_id_status_idx" ON "leave_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_from_date_idx" ON "leave_requests"("employee_id", "from_date");

-- CreateIndex
CREATE INDEX "overtime_requests_organization_id_status_idx" ON "overtime_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "overtime_requests_employee_id_work_date_idx" ON "overtime_requests"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "lead_sources_organization_id_idx" ON "lead_sources"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_organization_id_code_key" ON "lead_sources"("organization_id", "code");

-- CreateIndex
CREATE INDEX "funnel_stages_organization_id_position_idx" ON "funnel_stages"("organization_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "funnel_stages_organization_id_name_key" ON "funnel_stages"("organization_id", "name");

-- CreateIndex
CREATE INDEX "customers_organization_id_idx" ON "customers"("organization_id");

-- CreateIndex
CREATE INDEX "customers_organization_id_phone_idx" ON "customers"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "customers_branch_id_idx" ON "customers"("branch_id");

-- CreateIndex
CREATE INDEX "customers_assigned_employee_id_idx" ON "customers"("assigned_employee_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_pipeline_status_idx" ON "leads"("organization_id", "pipeline_status");

-- CreateIndex
CREATE INDEX "leads_organization_id_phone_idx" ON "leads"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "leads_organization_id_email_idx" ON "leads"("organization_id", "email");

-- CreateIndex
CREATE INDEX "leads_organization_id_score_idx" ON "leads"("organization_id", "score");

-- CreateIndex
CREATE INDEX "leads_assigned_to_id_idx" ON "leads"("assigned_to_id");

-- CreateIndex
CREATE INDEX "leads_customer_id_idx" ON "leads"("customer_id");

-- CreateIndex
CREATE INDEX "leads_reminder_at_idx" ON "leads"("reminder_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_organization_id_platform_external_lead_id_key" ON "leads"("organization_id", "platform_external_lead_id");

-- CreateIndex
CREATE INDEX "services_organization_id_idx" ON "services"("organization_id");

-- CreateIndex
CREATE INDEX "appointments_organization_id_scheduled_at_idx" ON "appointments"("organization_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_branch_id_status_idx" ON "appointments"("branch_id", "status");

-- CreateIndex
CREATE INDEX "appointments_employee_id_scheduled_at_idx" ON "appointments"("employee_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_room_id_scheduled_at_idx" ON "appointments"("room_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_bed_id_scheduled_at_idx" ON "appointments"("bed_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_ad_campaign_id_idx" ON "appointments"("ad_campaign_id");

-- CreateIndex
CREATE INDEX "spa_rooms_organization_id_branch_id_idx" ON "spa_rooms"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "spa_beds_organization_id_room_id_idx" ON "spa_beds"("organization_id", "room_id");

-- CreateIndex
CREATE INDEX "spa_equipments_organization_id_idx" ON "spa_equipments"("organization_id");

-- CreateIndex
CREATE INDEX "lead_notes_lead_id_created_at_idx" ON "lead_notes"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_activities_lead_id_created_at_idx" ON "lead_activities"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_activities_organization_id_created_at_idx" ON "lead_activities"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_saved_views_organization_id_user_id_idx" ON "lead_saved_views"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "crm_tasks_organization_id_status_due_at_idx" ON "crm_tasks"("organization_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "customer_merge_logs_organization_id_created_at_idx" ON "customer_merge_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_assignment_rules_organization_id_branch_id_idx" ON "lead_assignment_rules"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "orders_organization_id_ordered_at_idx" ON "orders"("organization_id", "ordered_at");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_lead_id_idx" ON "orders"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_organization_id_order_number_key" ON "orders"("organization_id", "order_number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_paid_at_idx" ON "payments"("organization_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "expenses_organization_id_expense_date_idx" ON "expenses"("organization_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

-- CreateIndex
CREATE INDEX "ad_accounts_organization_id_platform_idx" ON "ad_accounts"("organization_id", "platform");

-- CreateIndex
CREATE INDEX "ad_campaigns_organization_id_status_idx" ON "ad_campaigns"("organization_id", "status");

-- CreateIndex
CREATE INDEX "ad_campaigns_ad_account_id_idx" ON "ad_campaigns"("ad_account_id");

-- CreateIndex
CREATE INDEX "ad_campaigns_organization_id_external_id_idx" ON "ad_campaigns"("organization_id", "external_id");

-- CreateIndex
CREATE INDEX "ad_daily_stats_organization_id_date_idx" ON "ad_daily_stats"("organization_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_daily_stats_ad_campaign_id_date_key" ON "ad_daily_stats"("ad_campaign_id", "date");

-- CreateIndex
CREATE INDEX "ad_sets_organization_id_ad_campaign_id_idx" ON "ad_sets"("organization_id", "ad_campaign_id");

-- CreateIndex
CREATE INDEX "ad_sets_organization_id_external_id_idx" ON "ad_sets"("organization_id", "external_id");

-- CreateIndex
CREATE INDEX "ad_creatives_organization_id_ad_campaign_id_idx" ON "ad_creatives"("organization_id", "ad_campaign_id");

-- CreateIndex
CREATE INDEX "ad_creatives_organization_id_external_id_idx" ON "ad_creatives"("organization_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_attributions_lead_id_key" ON "lead_attributions"("lead_id");

-- CreateIndex
CREATE INDEX "lead_attributions_organization_id_ad_campaign_id_idx" ON "lead_attributions"("organization_id", "ad_campaign_id");

-- CreateIndex
CREATE INDEX "lead_attributions_organization_id_fbclid_idx" ON "lead_attributions"("organization_id", "fbclid");

-- CreateIndex
CREATE INDEX "lead_attributions_organization_id_gclid_idx" ON "lead_attributions"("organization_id", "gclid");

-- CreateIndex
CREATE INDEX "lead_attributions_organization_id_utm_source_utm_campaign_idx" ON "lead_attributions"("organization_id", "utm_source", "utm_campaign");

-- CreateIndex
CREATE INDEX "marketing_funnel_events_organization_id_event_type_occurred_idx" ON "marketing_funnel_events"("organization_id", "event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "marketing_funnel_events_organization_id_ad_campaign_id_occu_idx" ON "marketing_funnel_events"("organization_id", "ad_campaign_id", "occurred_at");

-- CreateIndex
CREATE INDEX "marketing_funnel_events_lead_id_idx" ON "marketing_funnel_events"("lead_id");

-- CreateIndex
CREATE INDEX "marketing_funnel_events_customer_id_idx" ON "marketing_funnel_events"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_funnel_events_organization_id_idempotency_key_key" ON "marketing_funnel_events"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "offline_conversion_jobs_organization_id_status_next_retry_a_idx" ON "offline_conversion_jobs"("organization_id", "status", "next_retry_at");

-- CreateIndex
CREATE INDEX "offline_conversion_jobs_provider_status_idx" ON "offline_conversion_jobs"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "offline_conversion_jobs_organization_id_idempotency_key_key" ON "offline_conversion_jobs"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "message_templates_organization_id_channel_idx" ON "message_templates"("organization_id", "channel");

-- CreateIndex
CREATE INDEX "message_templates_organization_id_approval_status_idx" ON "message_templates"("organization_id", "approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_org_policies_organization_id_key" ON "messaging_org_policies"("organization_id");

-- CreateIndex
CREATE INDEX "automation_flows_organization_id_trigger_type_idx" ON "automation_flows"("organization_id", "trigger_type");

-- CreateIndex
CREATE INDEX "automation_logs_organization_id_created_at_idx" ON "automation_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "automation_logs_automation_flow_id_idx" ON "automation_logs"("automation_flow_id");

-- CreateIndex
CREATE UNIQUE INDEX "automation_logs_organization_id_idempotency_key_key" ON "automation_logs"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "integrations_organization_id_idx" ON "integrations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_organization_id_provider_key" ON "integrations"("organization_id", "provider");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_organization_id_channel_idx" ON "messaging_contact_identities"("organization_id", "channel");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_organization_id_customer_id_idx" ON "messaging_contact_identities"("organization_id", "customer_id");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_organization_id_lead_id_idx" ON "messaging_contact_identities"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_organization_id_phone_normaliz_idx" ON "messaging_contact_identities"("organization_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_organization_id_last_inbound_a_idx" ON "messaging_contact_identities"("organization_id", "last_inbound_at");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_organization_id_consent_status_idx" ON "messaging_contact_identities"("organization_id", "consent_status", "opted_out");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_organization_id_follow_status_idx" ON "messaging_contact_identities"("organization_id", "follow_status");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_organization_id_merged_into_id_idx" ON "messaging_contact_identities"("organization_id", "merged_into_id");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_organization_id_display_name_idx" ON "messaging_contact_identities"("organization_id", "display_name");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_integration_id_idx" ON "messaging_contact_identities"("integration_id");

-- CreateIndex
CREATE INDEX "messaging_contact_identities_chatbot_conversation_id_idx" ON "messaging_contact_identities"("chatbot_conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_contact_identities_organization_id_integration_sc_key" ON "messaging_contact_identities"("organization_id", "integration_scope_key", "external_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_contact_identities_organization_id_integration_id_key" ON "messaging_contact_identities"("organization_id", "integration_id", "external_user_id");

-- CreateIndex
CREATE INDEX "messaging_identity_merge_logs_organization_id_created_at_idx" ON "messaging_identity_merge_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "messaging_identity_merge_logs_primary_identity_id_idx" ON "messaging_identity_merge_logs"("primary_identity_id");

-- CreateIndex
CREATE INDEX "messaging_channel_connections_organization_id_channel_idx" ON "messaging_channel_connections"("organization_id", "channel");

-- CreateIndex
CREATE INDEX "messaging_channel_connections_organization_id_status_idx" ON "messaging_channel_connections"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_channel_connections_organization_id_channel_accou_key" ON "messaging_channel_connections"("organization_id", "channel", "account_ref");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_channel_connections_channel_account_ref_key" ON "messaging_channel_connections"("channel", "account_ref");

-- CreateIndex
CREATE INDEX "messaging_webhook_events_organization_id_received_at_idx" ON "messaging_webhook_events"("organization_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_webhook_events_channel_event_key_key" ON "messaging_webhook_events"("channel", "event_key");

-- CreateIndex
CREATE INDEX "messaging_campaigns_organization_id_status_idx" ON "messaging_campaigns"("organization_id", "status");

-- CreateIndex
CREATE INDEX "messaging_campaigns_organization_id_channel_idx" ON "messaging_campaigns"("organization_id", "channel");

-- CreateIndex
CREATE INDEX "messaging_campaigns_organization_id_scheduled_at_idx" ON "messaging_campaigns"("organization_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "messaging_campaign_recipients_organization_id_campaign_id_idx" ON "messaging_campaign_recipients"("organization_id", "campaign_id");

-- CreateIndex
CREATE INDEX "messaging_campaign_recipients_campaign_id_status_idx" ON "messaging_campaign_recipients"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "messaging_campaign_recipients_identity_id_idx" ON "messaging_campaign_recipients"("identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_campaign_recipients_campaign_id_idempotency_key_key" ON "messaging_campaign_recipients"("campaign_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "messaging_suppressions_organization_id_channel_idx" ON "messaging_suppressions"("organization_id", "channel");

-- CreateIndex
CREATE INDEX "messaging_suppressions_organization_id_phone_normalized_idx" ON "messaging_suppressions"("organization_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "messaging_suppressions_organization_id_identity_id_idx" ON "messaging_suppressions"("organization_id", "identity_id");

-- CreateIndex
CREATE INDEX "messaging_suppressions_organization_id_external_user_id_idx" ON "messaging_suppressions"("organization_id", "external_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_ads_connections_organization_id_key" ON "facebook_ads_connections"("organization_id");

-- CreateIndex
CREATE INDEX "facebook_ads_connections_connected_by_user_id_idx" ON "facebook_ads_connections"("connected_by_user_id");

-- CreateIndex
CREATE INDEX "facebook_ads_sync_logs_organization_id_sync_started_at_idx" ON "facebook_ads_sync_logs"("organization_id", "sync_started_at");

-- CreateIndex
CREATE INDEX "facebook_ads_campaign_snapshots_organization_id_ad_account__idx" ON "facebook_ads_campaign_snapshots"("organization_id", "ad_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_ads_campaign_snapshots_organization_id_campaign_id_key" ON "facebook_ads_campaign_snapshots"("organization_id", "campaign_id", "date_from", "date_to");

-- CreateIndex
CREATE INDEX "campaigns_organization_id_status_idx" ON "campaigns"("organization_id", "status");

-- CreateIndex
CREATE INDEX "ai_reports_organization_id_type_idx" ON "ai_reports"("organization_id", "type");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_organization_id_idx" ON "auth_sessions"("organization_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "login_attempts_email_created_at_idx" ON "login_attempts"("email", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_address_created_at_idx" ON "login_attempts"("ip_address", "created_at");

-- CreateIndex
CREATE INDEX "registration_otps_email_created_at_idx" ON "registration_otps"("email", "created_at");

-- CreateIndex
CREATE INDEX "registration_otps_expires_at_idx" ON "registration_otps"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE INDEX "subscriptions_organization_id_status_idx" ON "subscriptions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_status_trial_ends_at_idx" ON "subscriptions"("status", "trial_ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "trial_claims_user_id_key" ON "trial_claims"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trial_claims_organization_id_key" ON "trial_claims"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "trial_claims_subscription_id_key" ON "trial_claims"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "trial_claims_email_normalized_key" ON "trial_claims"("email_normalized");

-- CreateIndex
CREATE INDEX "trial_claims_phone_normalized_idx" ON "trial_claims"("phone_normalized");

-- CreateIndex
CREATE INDEX "trial_claims_device_fingerprint_hash_idx" ON "trial_claims"("device_fingerprint_hash");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_code_key" ON "payment_orders"("code");

-- CreateIndex
CREATE INDEX "payment_orders_organization_id_status_idx" ON "payment_orders"("organization_id", "status");

-- CreateIndex
CREATE INDEX "payment_orders_status_expires_at_idx" ON "payment_orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "payment_orders_created_at_idx" ON "payment_orders"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_sepay_transaction_id_key" ON "payment_transactions"("sepay_transaction_id");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_order_id_idx" ON "payment_transactions"("payment_order_id");

-- CreateIndex
CREATE INDEX "payment_transactions_created_at_idx" ON "payment_transactions"("created_at");

-- CreateIndex
CREATE INDEX "payment_transactions_matched_created_at_idx" ON "payment_transactions"("matched", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_wallets_organization_id_key" ON "credit_wallets"("organization_id");

-- CreateIndex
CREATE INDEX "credit_transactions_organization_id_created_at_idx" ON "credit_transactions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_transactions_wallet_id_idx" ON "credit_transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "business_goal_scenarios_organization_id_created_at_idx" ON "business_goal_scenarios"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "business_goal_scenarios_branch_id_idx" ON "business_goal_scenarios"("branch_id");

-- CreateIndex
CREATE INDEX "chatbot_bots_organization_id_status_idx" ON "chatbot_bots"("organization_id", "status");

-- CreateIndex
CREATE INDEX "chatbot_knowledge_sources_bot_id_status_idx" ON "chatbot_knowledge_sources"("bot_id", "status");

-- CreateIndex
CREATE INDEX "chatbot_knowledge_sources_organization_id_idx" ON "chatbot_knowledge_sources"("organization_id");

-- CreateIndex
CREATE INDEX "chatbot_channels_organization_id_channel_type_idx" ON "chatbot_channels"("organization_id", "channel_type");

-- CreateIndex
CREATE INDEX "chatbot_conversations_organization_id_updated_at_idx" ON "chatbot_conversations"("organization_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_conversations_bot_id_session_id_key" ON "chatbot_conversations"("bot_id", "session_id");

-- CreateIndex
CREATE INDEX "chatbot_messages_conversation_id_created_at_idx" ON "chatbot_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "chatbot_leads_organization_id_created_at_idx" ON "chatbot_leads"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "chatbot_leads_bot_id_idx" ON "chatbot_leads"("bot_id");

-- CreateIndex
CREATE INDEX "chatbot_usage_organization_id_month_idx" ON "chatbot_usage"("organization_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_usage_organization_id_month_bot_id_key" ON "chatbot_usage"("organization_id", "month", "bot_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_org_settings_organization_id_key" ON "chatbot_org_settings"("organization_id");

-- CreateIndex
CREATE INDEX "chatbot_facebook_pages_organization_id_idx" ON "chatbot_facebook_pages"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_facebook_pages_page_id_key" ON "chatbot_facebook_pages"("page_id");

-- CreateIndex
CREATE INDEX "ad_connections_user_id_idx" ON "ad_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_connections_organization_id_provider_key" ON "ad_connections"("organization_id", "provider");

-- CreateIndex
CREATE INDEX "ads_sync_jobs_organization_id_status_created_at_idx" ON "ads_sync_jobs"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ads_sync_jobs_organization_id_platform_account_id_status_idx" ON "ads_sync_jobs"("organization_id", "platform", "account_id", "status");

-- CreateIndex
CREATE INDEX "ads_sync_jobs_connection_id_idx" ON "ads_sync_jobs"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "ads_sync_jobs_idempotency_key_key" ON "ads_sync_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "ad_manager_accounts_organization_id_idx" ON "ad_manager_accounts"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_manager_accounts_user_id_platform_external_id_key" ON "ad_manager_accounts"("user_id", "platform", "external_id");

-- CreateIndex
CREATE INDEX "ad_manager_campaigns_organization_id_status_idx" ON "ad_manager_campaigns"("organization_id", "status");

-- CreateIndex
CREATE INDEX "ad_manager_campaigns_account_id_idx" ON "ad_manager_campaigns"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_manager_campaigns_user_id_platform_external_id_key" ON "ad_manager_campaigns"("user_id", "platform", "external_id");

-- CreateIndex
CREATE INDEX "ad_insights_organization_id_date_from_idx" ON "ad_insights"("organization_id", "date_from");

-- CreateIndex
CREATE INDEX "ad_insights_organization_id_platform_date_from_idx" ON "ad_insights"("organization_id", "platform", "date_from");

-- CreateIndex
CREATE INDEX "ad_insights_campaign_id_idx" ON "ad_insights"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_insights_user_id_platform_external_campaign_id_date_from_key" ON "ad_insights"("user_id", "platform", "external_campaign_id", "date_from", "date_to");

-- CreateIndex
CREATE UNIQUE INDEX "ad_manager_settings_user_id_key" ON "ad_manager_settings"("user_id");

-- CreateIndex
CREATE INDEX "ad_manager_settings_organization_id_idx" ON "ad_manager_settings"("organization_id");

-- CreateIndex
CREATE INDEX "ad_automation_rules_user_id_enabled_idx" ON "ad_automation_rules"("user_id", "enabled");

-- CreateIndex
CREATE INDEX "ad_automation_logs_user_id_created_at_idx" ON "ad_automation_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ad_ai_recommendations_user_id_dismissed_idx" ON "ad_ai_recommendations"("user_id", "dismissed");

-- CreateIndex
CREATE INDEX "ad_email_reports_user_id_idx" ON "ad_email_reports"("user_id");

-- CreateIndex
CREATE INDEX "ad_drafts_user_id_status_idx" ON "ad_drafts"("user_id", "status");

-- CreateIndex
CREATE INDEX "ads_action_requests_organization_id_status_created_at_idx" ON "ads_action_requests"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ads_action_requests_organization_id_campaign_id_idx" ON "ads_action_requests"("organization_id", "campaign_id");

-- CreateIndex
CREATE INDEX "ads_action_requests_requested_by_user_id_idx" ON "ads_action_requests"("requested_by_user_id");

-- CreateIndex
CREATE INDEX "ads_action_requests_approved_by_user_id_idx" ON "ads_action_requests"("approved_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ads_action_requests_idempotency_key_key" ON "ads_action_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "auto_post_facebook_connections_organization_id_idx" ON "auto_post_facebook_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_post_facebook_connections_user_id_organization_id_key" ON "auto_post_facebook_connections"("user_id", "organization_id");

-- CreateIndex
CREATE INDEX "auto_post_facebook_pages_user_id_idx" ON "auto_post_facebook_pages"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_post_facebook_pages_connection_id_page_id_key" ON "auto_post_facebook_pages"("connection_id", "page_id");

-- CreateIndex
CREATE INDEX "auto_post_facebook_oauth_pending_connections_organization_i_idx" ON "auto_post_facebook_oauth_pending_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_post_facebook_oauth_pending_connections_user_id_organi_key" ON "auto_post_facebook_oauth_pending_connections"("user_id", "organization_id");

-- CreateIndex
CREATE INDEX "auto_posts_user_id_status_idx" ON "auto_posts"("user_id", "status");

-- CreateIndex
CREATE INDEX "auto_posts_user_id_created_at_idx" ON "auto_posts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "auto_posts_status_scheduled_at_idx" ON "auto_posts"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "auto_posts_organization_id_industry_id_idx" ON "auto_posts"("organization_id", "industry_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_industries_slug_key" ON "content_industries"("slug");

-- CreateIndex
CREATE INDEX "content_industries_is_active_sort_order_idx" ON "content_industries"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "content_marketing_preferences_organization_id_idx" ON "content_marketing_preferences"("organization_id");

-- CreateIndex
CREATE INDEX "content_marketing_preferences_user_id_idx" ON "content_marketing_preferences"("user_id");

-- CreateIndex
CREATE INDEX "content_opinion_voice_profiles_organization_id_idx" ON "content_opinion_voice_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "content_opinion_voice_profiles_user_id_idx" ON "content_opinion_voice_profiles"("user_id");

-- CreateIndex
CREATE INDEX "video_transcriptions_organization_id_user_id_created_at_idx" ON "video_transcriptions"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "video_transcriptions_organization_id_id_idx" ON "video_transcriptions"("organization_id", "id");

-- CreateIndex
CREATE INDEX "video_transcriptions_organization_id_status_created_at_idx" ON "video_transcriptions"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "video_transcription_glossaries_organization_id_idx" ON "video_transcription_glossaries"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_transcription_glossaries_organization_id_user_id_key" ON "video_transcription_glossaries"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "content_teleprompter_sources_organization_id_user_id_idx" ON "content_teleprompter_sources"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "content_teleprompter_sources_organization_id_id_idx" ON "content_teleprompter_sources"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "content_teleprompter_sources_organization_id_user_id_client_key" ON "content_teleprompter_sources"("organization_id", "user_id", "client_content_id");

-- CreateIndex
CREATE INDEX "auto_post_api_logs_user_id_created_at_idx" ON "auto_post_api_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "auto_post_api_logs_post_id_idx" ON "auto_post_api_logs"("post_id");

-- CreateIndex
CREATE INDEX "auto_post_publish_logs_user_id_created_at_idx" ON "auto_post_publish_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "auto_post_publish_logs_post_id_idx" ON "auto_post_publish_logs"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_post_meta_data_deletion_requests_confirmation_code_key" ON "auto_post_meta_data_deletion_requests"("confirmation_code");

-- CreateIndex
CREATE UNIQUE INDEX "auto_post_meta_data_deletion_requests_facebook_user_id_key" ON "auto_post_meta_data_deletion_requests"("facebook_user_id");

-- CreateIndex
CREATE INDEX "auto_post_meta_data_deletion_requests_status_created_at_idx" ON "auto_post_meta_data_deletion_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "auto_post_meta_deauthorize_events_facebook_user_id_idx" ON "auto_post_meta_deauthorize_events"("facebook_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_post_meta_deauthorize_events_facebook_user_id_issued_a_key" ON "auto_post_meta_deauthorize_events"("facebook_user_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "auto_post_facebook_oauth_states_state_hash_key" ON "auto_post_facebook_oauth_states"("state_hash");

-- CreateIndex
CREATE INDEX "auto_post_facebook_oauth_states_organization_id_idx" ON "auto_post_facebook_oauth_states"("organization_id");

-- CreateIndex
CREATE INDEX "rag_knowledge_bases_organization_id_created_at_idx" ON "rag_knowledge_bases"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "rag_kb_documents_knowledge_base_id_idx" ON "rag_kb_documents"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "rag_kb_documents_organization_id_idx" ON "rag_kb_documents"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_profiles_user_id_key" ON "affiliate_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_profiles_code_key" ON "affiliate_profiles"("code");

-- CreateIndex
CREATE INDEX "affiliate_profiles_organization_id_idx" ON "affiliate_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "affiliate_profiles_status_idx" ON "affiliate_profiles"("status");

-- CreateIndex
CREATE INDEX "affiliate_clicks_affiliate_id_created_at_idx" ON "affiliate_clicks"("affiliate_id", "created_at");

-- CreateIndex
CREATE INDEX "affiliate_clicks_code_created_at_idx" ON "affiliate_clicks"("code", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_referrals_referred_organization_id_key" ON "affiliate_referrals"("referred_organization_id");

-- CreateIndex
CREATE INDEX "affiliate_referrals_affiliate_id_registered_at_idx" ON "affiliate_referrals"("affiliate_id", "registered_at");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_commissions_order_id_key" ON "affiliate_commissions"("order_id");

-- CreateIndex
CREATE INDEX "affiliate_commissions_affiliate_id_status_idx" ON "affiliate_commissions"("affiliate_id", "status");

-- CreateIndex
CREATE INDEX "affiliate_commissions_status_hold_until_idx" ON "affiliate_commissions"("status", "hold_until");

-- CreateIndex
CREATE INDEX "affiliate_commissions_organization_id_idx" ON "affiliate_commissions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_payout_methods_affiliate_id_key" ON "affiliate_payout_methods"("affiliate_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_payout_methods_account_number_key" ON "affiliate_payout_methods"("account_number");

-- CreateIndex
CREATE INDEX "affiliate_payout_requests_affiliate_id_status_idx" ON "affiliate_payout_requests"("affiliate_id", "status");

-- CreateIndex
CREATE INDEX "affiliate_payout_requests_status_created_at_idx" ON "affiliate_payout_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "affiliate_fraud_signals_affiliate_id_created_at_idx" ON "affiliate_fraud_signals"("affiliate_id", "created_at");

-- CreateIndex
CREATE INDEX "affiliate_fraud_signals_signal_type_created_at_idx" ON "affiliate_fraud_signals"("signal_type", "created_at");

-- CreateIndex
CREATE INDEX "affiliate_audit_logs_affiliate_id_created_at_idx" ON "affiliate_audit_logs"("affiliate_id", "created_at");

-- CreateIndex
CREATE INDEX "affiliate_audit_logs_action_created_at_idx" ON "affiliate_audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_referred_by_affiliate_id_fkey" FOREIGN KEY ("referred_by_affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_previous_contract_id_fkey" FOREIGN KEY ("previous_contract_id") REFERENCES "employment_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_account_invites" ADD CONSTRAINT "employee_account_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_account_invites" ADD CONSTRAINT "employee_account_invites_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_account_invites" ADD CONSTRAINT "employee_account_invites_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_account_invites" ADD CONSTRAINT "employee_account_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_shift_policies" ADD CONSTRAINT "work_shift_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_shift_policies" ADD CONSTRAINT "work_shift_policies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_shift_policies" ADD CONSTRAINT "work_shift_policies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_shift_policy_versions" ADD CONSTRAINT "work_shift_policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "work_shift_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "work_shift_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_qr_tokens" ADD CONSTRAINT "attendance_qr_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_qr_tokens" ADD CONSTRAINT "attendance_qr_tokens_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_qr_token_id_fkey" FOREIGN KEY ("qr_token_id") REFERENCES "attendance_qr_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_timesheet_period_id_fkey" FOREIGN KEY ("timesheet_period_id") REFERENCES "timesheet_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_timesheet_period_id_fkey" FOREIGN KEY ("timesheet_period_id") REFERENCES "timesheet_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funnel_stages" ADD CONSTRAINT "funnel_stages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_lead_source_id_fkey" FOREIGN KEY ("lead_source_id") REFERENCES "lead_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_employee_id_fkey" FOREIGN KEY ("assigned_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_lead_source_id_fkey" FOREIGN KEY ("lead_source_id") REFERENCES "lead_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_funnel_stage_id_fkey" FOREIGN KEY ("funnel_stage_id") REFERENCES "funnel_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "spa_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "spa_beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "spa_equipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_rescheduled_from_id_fkey" FOREIGN KEY ("rescheduled_from_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spa_rooms" ADD CONSTRAINT "spa_rooms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spa_rooms" ADD CONSTRAINT "spa_rooms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spa_beds" ADD CONSTRAINT "spa_beds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spa_beds" ADD CONSTRAINT "spa_beds_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spa_beds" ADD CONSTRAINT "spa_beds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "spa_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spa_equipments" ADD CONSTRAINT "spa_equipments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spa_equipments" ADD CONSTRAINT "spa_equipments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_saved_views" ADD CONSTRAINT "lead_saved_views_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_saved_views" ADD CONSTRAINT "lead_saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_merge_logs" ADD CONSTRAINT "customer_merge_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_rules" ADD CONSTRAINT "lead_assignment_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_rules" ADD CONSTRAINT "lead_assignment_rules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "ad_daily_stats_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "ad_daily_stats_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_ad_set_id_fkey" FOREIGN KEY ("ad_set_id") REFERENCES "ad_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_ad_set_id_fkey" FOREIGN KEY ("ad_set_id") REFERENCES "ad_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ad_creatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_funnel_events" ADD CONSTRAINT "marketing_funnel_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_funnel_events" ADD CONSTRAINT "marketing_funnel_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_funnel_events" ADD CONSTRAINT "marketing_funnel_events_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_conversion_jobs" ADD CONSTRAINT "offline_conversion_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_org_policies" ADD CONSTRAINT "messaging_org_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flows" ADD CONSTRAINT "automation_flows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_flows" ADD CONSTRAINT "automation_flows_message_template_id_fkey" FOREIGN KEY ("message_template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_automation_flow_id_fkey" FOREIGN KEY ("automation_flow_id") REFERENCES "automation_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_contact_identities" ADD CONSTRAINT "messaging_contact_identities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_contact_identities" ADD CONSTRAINT "messaging_contact_identities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_contact_identities" ADD CONSTRAINT "messaging_contact_identities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_contact_identities" ADD CONSTRAINT "messaging_contact_identities_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_contact_identities" ADD CONSTRAINT "messaging_contact_identities_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "messaging_contact_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_contact_identities" ADD CONSTRAINT "messaging_contact_identities_chatbot_conversation_id_fkey" FOREIGN KEY ("chatbot_conversation_id") REFERENCES "chatbot_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_identity_merge_logs" ADD CONSTRAINT "messaging_identity_merge_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_identity_merge_logs" ADD CONSTRAINT "messaging_identity_merge_logs_primary_identity_id_fkey" FOREIGN KEY ("primary_identity_id") REFERENCES "messaging_contact_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_channel_connections" ADD CONSTRAINT "messaging_channel_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_webhook_events" ADD CONSTRAINT "messaging_webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_campaigns" ADD CONSTRAINT "messaging_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_campaigns" ADD CONSTRAINT "messaging_campaigns_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "messaging_channel_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_campaigns" ADD CONSTRAINT "messaging_campaigns_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_campaigns" ADD CONSTRAINT "messaging_campaigns_message_template_id_fkey" FOREIGN KEY ("message_template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_campaigns" ADD CONSTRAINT "messaging_campaigns_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_campaign_recipients" ADD CONSTRAINT "messaging_campaign_recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_campaign_recipients" ADD CONSTRAINT "messaging_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "messaging_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_campaign_recipients" ADD CONSTRAINT "messaging_campaign_recipients_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "messaging_contact_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_campaign_recipients" ADD CONSTRAINT "messaging_campaign_recipients_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_campaign_recipients" ADD CONSTRAINT "messaging_campaign_recipients_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_suppressions" ADD CONSTRAINT "messaging_suppressions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_ads_connections" ADD CONSTRAINT "facebook_ads_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_ads_connections" ADD CONSTRAINT "facebook_ads_connections_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_ads_sync_logs" ADD CONSTRAINT "facebook_ads_sync_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "facebook_ads_connections"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_ads_campaign_snapshots" ADD CONSTRAINT "facebook_ads_campaign_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "facebook_ads_connections"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_customers" ADD CONSTRAINT "campaign_customers_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_customers" ADD CONSTRAINT "campaign_customers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_claims" ADD CONSTRAINT "trial_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_claims" ADD CONSTRAINT "trial_claims_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_claims" ADD CONSTRAINT "trial_claims_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "credit_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_goal_scenarios" ADD CONSTRAINT "business_goal_scenarios_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_goal_scenarios" ADD CONSTRAINT "business_goal_scenarios_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_goal_scenarios" ADD CONSTRAINT "business_goal_scenarios_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_bots" ADD CONSTRAINT "chatbot_bots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_knowledge_sources" ADD CONSTRAINT "chatbot_knowledge_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_knowledge_sources" ADD CONSTRAINT "chatbot_knowledge_sources_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_channels" ADD CONSTRAINT "chatbot_channels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_channels" ADD CONSTRAINT "chatbot_channels_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chatbot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_leads" ADD CONSTRAINT "chatbot_leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_leads" ADD CONSTRAINT "chatbot_leads_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_leads" ADD CONSTRAINT "chatbot_leads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chatbot_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_usage" ADD CONSTRAINT "chatbot_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_usage" ADD CONSTRAINT "chatbot_usage_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_org_settings" ADD CONSTRAINT "chatbot_org_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_facebook_pages" ADD CONSTRAINT "chatbot_facebook_pages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_facebook_pages" ADD CONSTRAINT "chatbot_facebook_pages_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_connections" ADD CONSTRAINT "ad_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_connections" ADD CONSTRAINT "ad_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_sync_jobs" ADD CONSTRAINT "ads_sync_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_sync_jobs" ADD CONSTRAINT "ads_sync_jobs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ad_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_manager_accounts" ADD CONSTRAINT "ad_manager_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_manager_campaigns" ADD CONSTRAINT "ad_manager_campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_manager_campaigns" ADD CONSTRAINT "ad_manager_campaigns_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ad_manager_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insights" ADD CONSTRAINT "ad_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insights" ADD CONSTRAINT "ad_insights_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_manager_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_manager_settings" ADD CONSTRAINT "ad_manager_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_automation_rules" ADD CONSTRAINT "ad_automation_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_automation_logs" ADD CONSTRAINT "ad_automation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_automation_logs" ADD CONSTRAINT "ad_automation_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "ad_automation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_automation_logs" ADD CONSTRAINT "ad_automation_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_manager_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_ai_recommendations" ADD CONSTRAINT "ad_ai_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_ai_recommendations" ADD CONSTRAINT "ad_ai_recommendations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_manager_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_email_reports" ADD CONSTRAINT "ad_email_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_action_requests" ADD CONSTRAINT "ads_action_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_action_requests" ADD CONSTRAINT "ads_action_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_action_requests" ADD CONSTRAINT "ads_action_requests_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_post_facebook_connections" ADD CONSTRAINT "auto_post_facebook_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_post_facebook_pages" ADD CONSTRAINT "auto_post_facebook_pages_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "auto_post_facebook_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_post_facebook_pages" ADD CONSTRAINT "auto_post_facebook_pages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_posts" ADD CONSTRAINT "auto_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_posts" ADD CONSTRAINT "auto_posts_fanpage_id_fkey" FOREIGN KEY ("fanpage_id") REFERENCES "auto_post_facebook_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_posts" ADD CONSTRAINT "auto_posts_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "content_industries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_marketing_preferences" ADD CONSTRAINT "content_marketing_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_marketing_preferences" ADD CONSTRAINT "content_marketing_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_marketing_preferences" ADD CONSTRAINT "content_marketing_preferences_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "content_industries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_opinion_voice_profiles" ADD CONSTRAINT "content_opinion_voice_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_opinion_voice_profiles" ADD CONSTRAINT "content_opinion_voice_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_transcriptions" ADD CONSTRAINT "video_transcriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_transcriptions" ADD CONSTRAINT "video_transcriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_transcription_glossaries" ADD CONSTRAINT "video_transcription_glossaries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_transcription_glossaries" ADD CONSTRAINT "video_transcription_glossaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_teleprompter_sources" ADD CONSTRAINT "content_teleprompter_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_teleprompter_sources" ADD CONSTRAINT "content_teleprompter_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_post_api_logs" ADD CONSTRAINT "auto_post_api_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_post_api_logs" ADD CONSTRAINT "auto_post_api_logs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "auto_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_post_publish_logs" ADD CONSTRAINT "auto_post_publish_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_post_publish_logs" ADD CONSTRAINT "auto_post_publish_logs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "auto_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_knowledge_bases" ADD CONSTRAINT "rag_knowledge_bases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_kb_documents" ADD CONSTRAINT "rag_kb_documents_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "rag_knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_referrals" ADD CONSTRAINT "affiliate_referrals_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_referrals" ADD CONSTRAINT "affiliate_referrals_referred_organization_id_fkey" FOREIGN KEY ("referred_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "affiliate_referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_payout_request_id_fkey" FOREIGN KEY ("payout_request_id") REFERENCES "affiliate_payout_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payout_methods" ADD CONSTRAINT "affiliate_payout_methods_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payout_requests" ADD CONSTRAINT "affiliate_payout_requests_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_fraud_signals" ADD CONSTRAINT "affiliate_fraud_signals_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_audit_logs" ADD CONSTRAINT "affiliate_audit_logs_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

