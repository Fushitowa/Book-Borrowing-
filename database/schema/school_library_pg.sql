-- PostgreSQL 15+ compatible schema for Carbonell School Library
-- Adapted from school_library.sql (MySQL) for use with Supabase PostgreSQL
-- Run this once against your Supabase database via the SQL editor
--
-- IMPORTANT: Before running, ensure you have:
-- 1. Created a Supabase project at supabase.com
-- 2. Note the DATABASE_URL from Settings > Database > Connection string
-- 3. Run this schema via the Supabase SQL Editor or psql
--
-- For Vercel deployment: set DATABASE_URL env var to your Supabase connection string
-- Environment: DATABASE_URL=postgresql://library_app:PASSWORD@db.your-project.supabase.co:5432/postgres

-- Create extension for UUID support (if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-osc";

-- ============ ROLES & AUTHENTICATION ============

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(254) NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE','DISABLED','LOCKED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() ON UPDATE NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id),
  KEY ix_user_roles_role (role_id, user_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ============ STUDENT PROFILES ============

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id BIGINT NOT NULL UNIQUE,
  student_number VARCHAR(40) NOT NULL UNIQUE,
  program VARCHAR(120) NULL,
  year_level VARCHAR(20) NULL,
  section VARCHAR(50) NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT fk_student_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT
);

-- Insert default roles
INSERT INTO roles (code, name, description) VALUES
  ('ADMIN', 'Administrator', 'Manages system configuration and user access.'),
  ('LIBRARIAN', 'Librarian', 'Manages catalog records and circulation.'),
  ('STUDENT', 'Student', 'May borrow and reserve library materials.')
ON CONFLICT (code) DO NOTHING;

-- ============ LOAN POLICIES ============

CREATE TABLE IF NOT EXISTS loan_policies (
  id BIGSERIAL PRIMARY KEY,
  borrower_role_id BIGINT NOT NULL UNIQUE,
  loan_period_days SMALLINT UNSIGNED NOT NULL,
  max_active_loans SMALLINT UNSIGNED NOT NULL,
  max_renewals TINYINT UNSIGNED NOT NULL DEFAULT 0,
  renewal_extension_days SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_active_reservations SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT fk_loan_policies_role FOREIGN KEY (borrower_role_id) REFERENCES roles (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Insert student loan policy (14 days, 3 max active, 1 renewal, 7-day extension, 3 max reservations)
INSERT INTO loan_policies (borrower_role_id, loan_period_days, max_active_loans, max_renewals,
   renewal_extension_days, max_active_reservations, is_active)
SELECT id, 14, 3, 1, 7, 3, TRUE
FROM roles WHERE code = 'STUDENT'
ON CONFLICT (borrower_role_id) DO UPDATE SET
  loan_period_days = EXCLUDED.loan_period_days,
  max_active_loans = EXCLUDED.max_active_loans,
  max_renewals = EXCLUDED.max_renewals,
  renewal_extension_days = EXCLUDED.renewal_extension_days,
  max_active_reservations = EXCLUDED.max_active_reservations,
  is_active = EXCLUDED.is_active;

-- ============ CATALOG ============

CREATE TABLE IF NOT EXISTS publishers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS authors (
  id BIGSERIAL PRIMARY KEY,
  display_name VARCHAR(180) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  parent_category_id BIGINT NULL,
  name VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(500) NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_category_id) REFERENCES categories (id) ON DELETE SET NULL ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS books (
  id BIGSERIAL PRIMARY KEY,
  isbn VARCHAR(20) NULL,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255) NULL,
  edition VARCHAR(80) NULL,
  publication_year SMALLINT UNSIGNED NULL,
  language_code VARCHAR(10) NULL,
  publisher_id BIGINT NULL,
  description TEXT NULL,
  cover_image_url VARCHAR(255) NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT fk_books_publisher FOREIGN KEY (publisher_id) REFERENCES publishers (id) ON DELETE SET NULL ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS book_authors (
  book_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  author_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (book_id, author_id),
  CONSTRAINT fk_book_authors_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_book_authors_author FOREIGN KEY (author_id) REFERENCES authors (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS book_categories (
  book_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  PRIMARY KEY (book_id, category_id),
  CONSTRAINT fk_book_categories_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_book_categories_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ============ PHYSICAL COPIES ============

CREATE TABLE IF NOT EXISTS book_copies (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT NOT NULL,
  barcode VARCHAR(80) NOT NULL UNIQUE,
  copy_status VARCHAR(20) NOT NULL DEFAULT 'IN_SERVICE' CHECK (copy_status IN ('IN_SERVICE','DAMAGED','LOST','WITHDRAWN')),
  shelf_location VARCHAR(100) NULL,
  acquired_at DATE NULL,
  notes VARCHAR(1000) NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT fk_book_copies_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ============ RESERVATIONS ============

CREATE TABLE IF NOT EXISTS reservations (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  allocated_copy_id BIGINT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','FULFILLED','CANCELLED','EXPIRED')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ready_at TIMESTAMP WITH TIME ZONE NULL,
  expires_at TIMESTAMP WITH TIME ZONE NULL,
  closed_at TIMESTAMP WITH TIME ZONE NULL,
  active_student_user_id BIGINT GENERATED ALWAYS AS (CASE WHEN status IN ('PENDING','READY') THEN student_user_id ELSE NULL END) STORED,
  active_book_id BIGINT GENERATED ALWAYS AS (CASE WHEN status IN ('PENDING','READY') THEN book_id ELSE NULL END) STORED,
  ready_copy_id BIGINT GENERATED ALWAYS AS (CASE WHEN status = 'READY' THEN allocated_copy_id ELSE NULL END) STORED,
  CONSTRAINT uq_reservations_active_student_book UNIQUE (active_student_user_id, active_book_id),
  CONSTRAINT uq_reservations_ready_copy UNIQUE (ready_copy_id),
  CONSTRAINT uq_reservations_id_student UNIQUE (id, student_user_id),
  CONSTRAINT ck_reservations_state CHECK (
    (status = 'PENDING' AND allocated_copy_id IS NULL AND ready_at IS NULL AND expires_at IS NULL AND closed_at IS NULL)
    OR (status = 'READY' AND allocated_copy_id IS NOT NULL AND ready_at IS NOT NULL AND expires_at > ready_at AND closed_at IS NULL)
    OR (status IN ('FULFILLED','CANCELLED','EXPIRED') AND allocated_copy_id IS NULL AND closed_at IS NOT NULL)
  ),
  CONSTRAINT fk_reservations_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reservations_student FOREIGN KEY (student_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reservations_copy_book FOREIGN KEY (allocated_copy_id, book_id) REFERENCES book_copies (id, book_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ============ LOANS ============

CREATE TABLE IF NOT EXISTS loans (
  id BIGSERIAL PRIMARY KEY,
  copy_id BIGINT NOT NULL,
  borrower_user_id BIGINT NOT NULL,
  reservation_id BIGINT NULL,
  checked_out_by_user_id BIGINT NULL,
  checked_out_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETURNED','LOST')),
  returned_at TIMESTAMP WITH TIME ZONE NULL,
  returned_by_user_id BIGINT NULL,
  return_condition VARCHAR(10) NULL CHECK (return_condition IN ('GOOD','DAMAGED')),
  return_notes VARCHAR(1000) NULL,
  lost_at TIMESTAMP WITH TIME ZONE NULL,
  active_copy_id BIGINT GENERATED ALWAYS AS (CASE WHEN status = 'ACTIVE' THEN copy_id ELSE NULL END) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT uq_loans_active_copy UNIQUE (active_copy_id),
  CONSTRAINT uq_loans_reservation UNIQUE (reservation_id),
  CONSTRAINT ck_loans_due_after_checkout CHECK (due_at > checked_out_at),
  CONSTRAINT ck_loans_status_timestamps CHECK (
    (status = 'ACTIVE' AND returned_at IS NULL AND lost_at IS NULL AND return_condition IS NULL)
    OR (status = 'RETURNED' AND returned_at >= checked_out_at AND lost_at IS NULL AND return_condition IS NOT NULL)
    OR (status = 'LOST' AND lost_at >= checked_out_at AND returned_at IS NULL AND return_condition IS NULL)
  ),
  CONSTRAINT fk_loans_copy FOREIGN KEY (copy_id) REFERENCES book_copies (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_loans_borrower FOREIGN KEY (borrower_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_loans_checkout_staff FOREIGN KEY (checked_out_by_user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_loans_return_staff FOREIGN KEY (returned_by_user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_loans_reservation_borrower FOREIGN KEY (reservation_id, borrower_user_id) REFERENCES reservations (id, student_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ============ RENEWALS ============

CREATE TABLE IF NOT EXISTS renewals (
  id BIGSERIAL PRIMARY KEY,
  loan_id BIGINT NOT NULL,
  renewal_number SMALLINT UNSIGNED NOT NULL,
  renewed_by_user_id BIGINT NULL,
  renewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  old_due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  new_due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  notes VARCHAR(500) NULL,
  CONSTRAINT uq_renewals_loan_number UNIQUE (loan_id, renewal_number),
  CONSTRAINT ck_renewals_due_increases CHECK (new_due_at > old_due_at),
  CONSTRAINT fk_renewals_loan FOREIGN KEY (loan_id) REFERENCES loans (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_renewals_actor FOREIGN KEY (renewed_by_user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE RESTRICT
);

-- ============ NOTIFICATIONS ============

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  notification_type VARCHAR(40) NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE NULL,
  dedupe_key VARCHAR(100) NULL,
  CONSTRAINT uq_notifications_user_dedupe UNIQUE (user_id, dedupe_key),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT
);

-- ============ AUDIT LOGS ============

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE RESTRICT
);

-- ============ BORROWING REQUESTS ============

CREATE TABLE IF NOT EXISTS borrowing_requests (
  id BIGSERIAL PRIMARY KEY,
  student_user_id BIGINT NOT NULL,
  book_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','ISSUED')),
  student_note TEXT NULL,
  response_reason TEXT NULL,
  handled_by_user_id BIGINT NULL,
  issued_by_user_id BIGINT NULL,
  loan_id BIGINT NULL,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE NULL,
  issued_at TIMESTAMP WITH TIME ZONE NULL,
  pending_student_id BIGINT GENERATED ALWAYS AS (CASE WHEN status = 'PENDING' THEN student_user_id ELSE NULL END) STORED,
  pending_book_id BIGINT GENERATED ALWAYS AS (CASE WHEN status = 'PENDING' THEN book_id ELSE NULL END) STORED,
  CONSTRAINT uq_borrowing_requests_pending_student_book UNIQUE (pending_student_id, pending_book_id),
  CONSTRAINT uq_borrowing_requests_loan UNIQUE (loan_id),
  CONSTRAINT ck_borrowing_requests_resolution CHECK (
    (status = 'PENDING' AND resolved_at IS NULL AND handled_by_user_id IS NULL AND issued_by_user_id IS NULL AND loan_id IS NULL AND issued_at IS NULL AND response_reason IS NULL)
    OR (status = 'APPROVED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND issued_by_user_id IS NULL AND loan_id IS NULL AND issued_at IS NULL AND response_reason IS NULL)
    OR (status = 'REJECTED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND issued_by_user_id IS NULL AND loan_id IS NULL AND issued_at IS NULL AND response_reason IS NOT NULL)
    OR (status = 'ISSUED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND issued_by_user_id IS NOT NULL AND loan_id IS NOT NULL AND issued_at IS NOT NULL AND response_reason IS NULL)
  ),
  CONSTRAINT fk_borrowing_requests_student FOREIGN KEY (student_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_handler FOREIGN KEY (handled_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_issuer FOREIGN KEY (issued_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_loan FOREIGN KEY (loan_id) REFERENCES loans (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS ix_audit_actor_created ON actor_user_id, created_at;
CREATE INDEX IF NOT EXISTS ix_audit_entity_created ON entity_type, entity_id, created_at;
CREATE INDEX IF NOT EXISTS ix_reservations_queue ON book_id, status, requested_at, id;
CREATE INDEX IF NOT EXISTS ix_reservations_student_status ON student_user_id, status;
CREATE INDEX IF NOT EXISTS ix_loans_borrower_status ON borrower_user_id, status, due_at;
CREATE INDEX IF NOT EXISTS ix_loans_status_due ON status, due_at;
CREATE INDEX IF NOT EXISTS ix_loans_copy_history ON copy_id, checked_out_at;
CREATE INDEX IF NOT EXISTS ix_notifications_user_created ON user_id, created_at;
CREATE INDEX IF NOT EXISTS ix_notifications_user_read ON user_id, read_at;