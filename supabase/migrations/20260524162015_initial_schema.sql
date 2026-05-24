-- Initial database schema from production Supabase
-- Generated: 2026-05-24
-- Project: hospital-analytics (wnyfrckxhwujsjcfxqou)

-- This migration captures the current database structure
-- Apply with: supabase db push

-- Tables are auto-created by Supabase based on the schema in production
-- This is a placeholder for version control

-- Key tables:
-- - lsmd (110,206 records) - Hospital cases
-- - patients_best (72,293) - Patient registry  
-- - empl (868) - Staff
-- - lsmd_doctors (282) - Doctor dictionary
-- - icd_10 (19,824) - Medical diagnoses
-- - departments (20) - Hospital departments
-- - operations (7,320) - Surgical operations
-- - localities (2,618) - Geographic locations

-- Indexes added for FK optimization:
-- - idx_lsmd_doc_name
-- - idx_lsmd_admission_dept
-- - idx_lsmd_discharge_dept
-- - idx_lsmd_current_dept
-- - idx_lsmd_icd_admission
-- - idx_departments_name
-- - idx_icd_10_code
-- - idx_empl_name
-- - idx_patients_best_name

-- For detailed schema, see: https://github.com/julbly38-a11y/hospital-analytics
