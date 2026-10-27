-- Update existing installations from grade-based details to college student details.
-- Run this once against the existing school_library database before restarting the API.
USE school_library;

ALTER TABLE student_profiles
  DROP INDEX ix_student_profiles_class,
  CHANGE COLUMN grade_level year_level VARCHAR(20) NULL,
  ADD COLUMN program VARCHAR(120) NULL AFTER student_number,
  ADD KEY ix_student_profiles_program_year_section (program, year_level, section);
