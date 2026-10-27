-- Separates librarian approval from issuing a physical copy.
-- Existing APPROVED requests that already have loans are preserved as ISSUED.
-- Run once against school_library after 20261028_borrowing_requests.sql.
USE school_library;

ALTER TABLE borrowing_requests
  MODIFY status ENUM('PENDING','APPROVED','REJECTED','ISSUED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN issued_by_user_id BIGINT UNSIGNED NULL AFTER handled_by_user_id,
  ADD COLUMN issued_at DATETIME NULL AFTER resolved_at,
  ADD KEY ix_borrowing_requests_issuer (issued_by_user_id),
  ADD CONSTRAINT fk_borrowing_requests_issuer FOREIGN KEY (issued_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE borrowing_requests DROP CHECK ck_borrowing_requests_resolution;

UPDATE borrowing_requests br
JOIN loans l ON l.id = br.loan_id
SET br.status = 'ISSUED',
    br.issued_by_user_id = COALESCE(l.checked_out_by_user_id, br.handled_by_user_id),
    br.issued_at = l.checked_out_at
WHERE br.status = 'APPROVED' AND br.loan_id IS NOT NULL;

ALTER TABLE borrowing_requests
  ADD CONSTRAINT ck_borrowing_requests_resolution CHECK (
    (status = 'PENDING' AND resolved_at IS NULL AND handled_by_user_id IS NULL AND issued_by_user_id IS NULL AND loan_id IS NULL AND issued_at IS NULL AND response_reason IS NULL)
    OR (status = 'APPROVED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND issued_by_user_id IS NULL AND loan_id IS NULL AND issued_at IS NULL AND response_reason IS NULL)
    OR (status = 'REJECTED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND issued_by_user_id IS NULL AND loan_id IS NULL AND issued_at IS NULL AND response_reason IS NOT NULL)
    OR (status = 'ISSUED' AND resolved_at IS NOT NULL AND handled_by_user_id IS NOT NULL AND issued_by_user_id IS NOT NULL AND loan_id IS NOT NULL AND issued_at IS NOT NULL AND response_reason IS NULL)
  );
