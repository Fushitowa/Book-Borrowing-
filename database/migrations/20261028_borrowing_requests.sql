-- Adds the first-class student borrowing request workflow.
-- Run once against the existing school_library database before restarting the API.
USE school_library;

CREATE TABLE IF NOT EXISTS borrowing_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_user_id BIGINT UNSIGNED NOT NULL,
  book_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  student_note VARCHAR(500) NULL,
  response_reason VARCHAR(500) NULL,
  handled_by_user_id BIGINT UNSIGNED NULL,
  loan_id BIGINT UNSIGNED NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  pending_student_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'PENDING' THEN student_user_id ELSE NULL END) STORED,
  pending_book_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'PENDING' THEN book_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_borrowing_requests_pending_student_book (pending_student_id, pending_book_id),
  UNIQUE KEY uq_borrowing_requests_loan (loan_id),
  KEY ix_borrowing_requests_status_requested (status, requested_at, id),
  KEY ix_borrowing_requests_student (student_user_id, requested_at),
  CONSTRAINT ck_borrowing_requests_resolution CHECK (
    (status = 'PENDING' AND resolved_at IS NULL AND handled_by_user_id IS NULL AND loan_id IS NULL AND response_reason IS NULL)
    OR (status = 'APPROVED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND loan_id IS NOT NULL)
    OR (status = 'REJECTED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND loan_id IS NULL AND response_reason IS NOT NULL)
  ),
  CONSTRAINT fk_borrowing_requests_student FOREIGN KEY (student_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_handler FOREIGN KEY (handled_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_borrowing_requests_loan FOREIGN KEY (loan_id) REFERENCES loans (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
