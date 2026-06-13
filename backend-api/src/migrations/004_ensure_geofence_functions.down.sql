-- Rollback Migration 004: Drop geofence functions
-- Note: Dropping these functions may break attendance check-in. Only run if reverting fully.

DROP FUNCTION IF EXISTS check_geo_fence(DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS calculate_distance(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
