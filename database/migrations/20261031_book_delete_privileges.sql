-- Apply once in phpMyAdmin as a MySQL administrator.
-- These narrow grants allow the application to remove book titles and only
-- their unused physical-copy rows. History tables remain protected by FK checks.
GRANT DELETE ON school_library.books TO 'library_app'@'127.0.0.1';
GRANT DELETE ON school_library.book_copies TO 'library_app'@'127.0.0.1';
