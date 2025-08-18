-- Seed data for the Test Fest Issue Tracker
-- Run this after setting up the database schema

SET search_path TO testfest;

-- Display the inserted test scripts
SELECT script_id, name, description FROM test_script ORDER BY script_id;
