-- College Library Book Borrowing System
-- Target: MySQL 8.0.16+ or MariaDB 10.4+ with InnoDB and utf8mb4.
-- Import this file once in phpMyAdmin. It creates the database if it does not exist.
-- Passwords are stored only as password hashes produced by the backend.

CREATE DATABASE IF NOT EXISTS school_library
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE school_library;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  email VARCHAR(254) NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  account_status ENUM('ACTIVE','DISABLED','LOCKED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_name (last_name, first_name),
  KEY ix_users_status (account_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  KEY ix_user_roles_role (role_id, user_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  student_number VARCHAR(40) NOT NULL,
  program VARCHAR(120) NULL,
  year_level VARCHAR(20) NULL,
  section VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_student_profiles_number (student_number),
  KEY ix_student_profiles_program_year_section (program, year_level, section),
  CONSTRAINT fk_student_profiles_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Policies are keyed to the role used for borrowing. The application selects the
-- borrower's applicable policy and enforces its limits inside a transaction.
CREATE TABLE IF NOT EXISTS loan_policies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  borrower_role_id BIGINT UNSIGNED NOT NULL,
  loan_period_days SMALLINT UNSIGNED NOT NULL,
  max_active_loans SMALLINT UNSIGNED NOT NULL,
  max_renewals TINYINT UNSIGNED NOT NULL DEFAULT 0,
  renewal_extension_days SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_active_reservations SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loan_policies_borrower_role (borrower_role_id),
  CONSTRAINT ck_loan_policies_positive_limits CHECK
    (loan_period_days > 0 AND max_active_loans > 0),
  CONSTRAINT ck_loan_policies_boolean CHECK (is_active IN (0, 1)),
  CONSTRAINT fk_loan_policies_role FOREIGN KEY (borrower_role_id) REFERENCES roles (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publishers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(180) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_publishers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  display_name VARCHAR(180) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_authors_display_name (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_category_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name),
  KEY ix_categories_parent (parent_category_id),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_category_id) REFERENCES categories (id)
    ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A book row represents a cataloged title/edition; it is not a physical copy.
CREATE TABLE IF NOT EXISTS books (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  isbn VARCHAR(20) NULL,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255) NULL,
  edition VARCHAR(80) NULL,
  publication_year SMALLINT UNSIGNED NULL,
  language_code VARCHAR(10) NULL,
  publisher_id BIGINT UNSIGNED NULL,
  description TEXT NULL,
  cover_image_url VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_books_isbn (isbn),
  KEY ix_books_title (title),
  KEY ix_books_publisher (publisher_id),
  CONSTRAINT fk_books_publisher FOREIGN KEY (publisher_id) REFERENCES publishers (id)
    ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_authors (
  book_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  author_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (book_id, author_id),
  UNIQUE KEY uq_book_authors_order (book_id, author_order),
  KEY ix_book_authors_author (author_id, book_id),
  CONSTRAINT fk_book_authors_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_book_authors_author FOREIGN KEY (author_id) REFERENCES authors (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_categories (
  book_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (book_id, category_id),
  KEY ix_book_categories_category (category_id, book_id),
  CONSTRAINT fk_book_categories_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_book_categories_category FOREIGN KEY (category_id) REFERENCES categories (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_copies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id BIGINT UNSIGNED NOT NULL,
  barcode VARCHAR(80) NOT NULL,
  copy_status ENUM('IN_SERVICE','DAMAGED','LOST','WITHDRAWN') NOT NULL DEFAULT 'IN_SERVICE',
  shelf_location VARCHAR(100) NULL,
  acquired_at DATE NULL,
  notes VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_book_copies_barcode (barcode),
  UNIQUE KEY uq_book_copies_id_book (id, book_id),
  KEY ix_book_copies_book_status (book_id, copy_status),
  CONSTRAINT fk_book_copies_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reservations are title-level queue requests. READY reservations hold a specific
-- copy; the composite FK guarantees that copy belongs to the requested title.
CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id BIGINT UNSIGNED NOT NULL,
  student_user_id BIGINT UNSIGNED NOT NULL,
  allocated_copy_id BIGINT UNSIGNED NULL,
  status ENUM('PENDING','READY','FULFILLED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ready_at DATETIME NULL,
  expires_at DATETIME NULL,
  closed_at DATETIME NULL,
  active_student_user_id BIGINT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN status IN ('PENDING','READY') THEN student_user_id ELSE NULL END) STORED,
  active_book_id BIGINT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN status IN ('PENDING','READY') THEN book_id ELSE NULL END) STORED,
  ready_copy_id BIGINT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN status = 'READY' THEN allocated_copy_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reservations_active_student_book (active_student_user_id, active_book_id),
  UNIQUE KEY uq_reservations_ready_copy (ready_copy_id),
  UNIQUE KEY uq_reservations_id_student (id, student_user_id),
  KEY ix_reservations_queue (book_id, status, requested_at, id),
  KEY ix_reservations_student_status (student_user_id, status),
  CONSTRAINT ck_reservations_state CHECK (
    (status = 'PENDING' AND allocated_copy_id IS NULL AND ready_at IS NULL AND expires_at IS NULL AND closed_at IS NULL)
    OR (status = 'READY' AND allocated_copy_id IS NOT NULL AND ready_at IS NOT NULL AND expires_at > ready_at AND closed_at IS NULL)
    OR (status IN ('FULFILLED','CANCELLED','EXPIRED') AND allocated_copy_id IS NULL AND closed_at IS NOT NULL)
  ),
  CONSTRAINT fk_reservations_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reservations_student FOREIGN KEY (student_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reservations_copy_book FOREIGN KEY (allocated_copy_id, book_id)
    REFERENCES book_copies (id, book_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Overdue is derived from status='ACTIVE' and due_at < UTC now; it is not stored.
-- A stored generated key plus UNIQUE permits only one ACTIVE loan per physical copy.
CREATE TABLE IF NOT EXISTS loans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  copy_id BIGINT UNSIGNED NOT NULL,
  borrower_user_id BIGINT UNSIGNED NOT NULL,
  reservation_id BIGINT UNSIGNED NULL,
  checked_out_by_user_id BIGINT UNSIGNED NULL,
  checked_out_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at DATETIME NOT NULL,
  status ENUM('ACTIVE','RETURNED','LOST') NOT NULL DEFAULT 'ACTIVE',
  returned_at DATETIME NULL,
  returned_by_user_id BIGINT UNSIGNED NULL,
  return_condition ENUM('GOOD','DAMAGED') NULL,
  return_notes VARCHAR(1000) NULL,
  lost_at DATETIME NULL,
  active_copy_id BIGINT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN status = 'ACTIVE' THEN copy_id ELSE NULL END) STORED,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loans_active_copy (active_copy_id),
  UNIQUE KEY uq_loans_reservation (reservation_id),
  KEY ix_loans_borrower_status (borrower_user_id, status, due_at),
  KEY ix_loans_status_due (status, due_at),
  KEY ix_loans_copy_history (copy_id, checked_out_at),
  KEY ix_loans_checkout_staff (checked_out_by_user_id),
  KEY ix_loans_return_staff (returned_by_user_id),
  CONSTRAINT ck_loans_due_after_checkout CHECK (due_at > checked_out_at),
  CONSTRAINT ck_loans_status_timestamps CHECK (
    (status = 'ACTIVE' AND returned_at IS NULL AND lost_at IS NULL AND return_condition IS NULL)
    OR (status = 'RETURNED' AND returned_at >= checked_out_at AND lost_at IS NULL AND return_condition IS NOT NULL)
    OR (status = 'LOST' AND lost_at >= checked_out_at AND returned_at IS NULL AND return_condition IS NULL)
  ),
  CONSTRAINT fk_loans_copy FOREIGN KEY (copy_id) REFERENCES book_copies (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_loans_borrower FOREIGN KEY (borrower_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_loans_checkout_staff FOREIGN KEY (checked_out_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_loans_return_staff FOREIGN KEY (returned_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_loans_reservation_borrower FOREIGN KEY (reservation_id, borrower_user_id)
    REFERENCES reservations (id, student_user_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Students may request a checkout; a librarian approves by issuing an available
-- copy in the same transaction, or rejects with a recorded reason.
CREATE TABLE IF NOT EXISTS borrowing_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_user_id BIGINT UNSIGNED NOT NULL,
  book_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','ISSUED') NOT NULL DEFAULT 'PENDING',
  student_note VARCHAR(500) NULL,
  response_reason VARCHAR(500) NULL,
  handled_by_user_id BIGINT UNSIGNED NULL,
  issued_by_user_id BIGINT UNSIGNED NULL,
  loan_id BIGINT UNSIGNED NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  issued_at DATETIME NULL,
  pending_student_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'PENDING' THEN student_user_id ELSE NULL END) STORED,
  pending_book_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'PENDING' THEN book_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_borrowing_requests_pending_student_book (pending_student_id, pending_book_id),
  UNIQUE KEY uq_borrowing_requests_loan (loan_id),
  KEY ix_borrowing_requests_status_requested (status, requested_at, id),
  KEY ix_borrowing_requests_student (student_user_id, requested_at),
  KEY ix_borrowing_requests_issuer (issued_by_user_id),
  CONSTRAINT ck_borrowing_requests_resolution CHECK (
    (status = 'PENDING' AND resolved_at IS NULL AND handled_by_user_id IS NULL AND issued_by_user_id IS NULL AND loan_id IS NULL AND issued_at IS NULL AND response_reason IS NULL)
    OR (status = 'APPROVED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND issued_by_user_id IS NULL AND loan_id IS NULL AND issued_at IS NULL AND response_reason IS NULL)
    OR (status = 'REJECTED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND issued_by_user_id IS NULL AND loan_id IS NULL AND issued_at IS NULL AND response_reason IS NOT NULL)
    OR (status = 'ISSUED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND issued_by_user_id IS NOT NULL AND loan_id IS NOT NULL AND issued_at IS NOT NULL AND response_reason IS NULL)
  ),
  CONSTRAINT fk_borrowing_requests_student FOREIGN KEY (student_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_handler FOREIGN KEY (handled_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_issuer FOREIGN KEY (issued_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_loan FOREIGN KEY (loan_id) REFERENCES loans (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS renewals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  loan_id BIGINT UNSIGNED NOT NULL,
  renewal_number TINYINT UNSIGNED NOT NULL,
  renewed_by_user_id BIGINT UNSIGNED NULL,
  renewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  old_due_at DATETIME NOT NULL,
  new_due_at DATETIME NOT NULL,
  notes VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_renewals_loan_number (loan_id, renewal_number),
  KEY ix_renewals_actor (renewed_by_user_id),
  CONSTRAINT ck_renewals_due_increases CHECK (new_due_at > old_due_at),
  CONSTRAINT fk_renewals_loan FOREIGN KEY (loan_id) REFERENCES loans (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_renewals_actor FOREIGN KEY (renewed_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  notification_type VARCHAR(40) NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  dedupe_key VARCHAR(100) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_user_dedupe (user_id, dedupe_key),
  KEY ix_notifications_user_created (user_id, created_at),
  KEY ix_notifications_user_read (user_id, read_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only by application policy. entity_id is intentionally polymorphic and
-- therefore cannot have a single FK; use entity_type to identify the target table.
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_actor_created (actor_user_id, created_at),
  KEY ix_audit_entity_created (entity_type, entity_id, created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Essential reference data only. No default admin account or password is created.
INSERT INTO roles (code, name, description) VALUES
  ('ADMIN', 'Administrator', 'Manages system configuration and user access.'),
  ('LIBRARIAN', 'Librarian', 'Manages catalog records and circulation.'),
  ('STUDENT', 'Student', 'May borrow and reserve library materials.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);

INSERT INTO loan_policies
  (borrower_role_id, loan_period_days, max_active_loans, max_renewals,
   renewal_extension_days, max_active_reservations, is_active)
SELECT id, 14, 3, 1, 7, 3, 1
FROM roles
WHERE code = 'STUDENT'
ON DUPLICATE KEY UPDATE
  loan_period_days = VALUES(loan_period_days),
  max_active_loans = VALUES(max_active_loans),
  max_renewals = VALUES(max_renewals),
  renewal_extension_days = VALUES(renewal_extension_days),
  max_active_reservations = VALUES(max_active_reservations),
  is_active = VALUES(is_active);
