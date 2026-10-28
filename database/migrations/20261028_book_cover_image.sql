-- Adds an optional catalog-title cover image path. Existing titles remain unchanged.
-- Run once against school_library after importing the base schema.
USE school_library;

ALTER TABLE books
  ADD COLUMN cover_image_url VARCHAR(255) NULL AFTER description;
