-- Narrow available_hours to numeric(4,1) — max 24.0, single decimal place.
-- Plain numeric allows arbitrary precision which could cause unexpected
-- rounding in S-02's hour-budget arithmetic (available_hours * 60).
ALTER TABLE user_settings
  ALTER COLUMN available_hours TYPE numeric(4,1);
