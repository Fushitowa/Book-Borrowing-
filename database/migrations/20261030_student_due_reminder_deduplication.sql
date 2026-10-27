-- Enables idempotent student due-date reminders (one reminder per loan due date).
-- Run once after 20261029_separate_request_approval_from_issue.sql.
USE school_library;

ALTER TABLE notifications
  ADD COLUMN dedupe_key VARCHAR(100) NULL AFTER read_at,
  ADD UNIQUE KEY uq_notifications_user_dedupe (user_id, dedupe_key);
