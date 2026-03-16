ALTER TABLE user_preferences ADD COLUMN enable_operation_logging INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_preferences ADD COLUMN operation_log_retention_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE user_preferences ADD COLUMN operation_log_max_entries INTEGER NOT NULL DEFAULT 1000;
