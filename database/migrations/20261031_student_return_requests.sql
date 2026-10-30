-- Student-initiated return requests
-- Adds a return_requested_at column so students can signal they want to
-- return a book.  The librarian still confirms condition on physical handover.

USE school_library;

ALTER TABLE loans
  ADD COLUMN return_requested_at DATETIME NULL AFTER lost_at,
  ADD COLUMN return_requested_note VARCHAR(500) NULL AFTER return_requested_at;
