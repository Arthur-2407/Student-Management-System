-- Migration 004: Ensure geofence functions exist
-- These functions are defined in init.sql but may not exist on non-fresh databases
-- that were created before init.sql was updated, or that only run migrations.

-- Haversine distance calculation (meters)
CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 DOUBLE PRECISION,
    lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION,
    lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
    earth_radius DOUBLE PRECISION := 6371000; -- meters
    dlat DOUBLE PRECISION;
    dlon DOUBLE PRECISION;
    a DOUBLE PRECISION;
    c DOUBLE PRECISION;
BEGIN
    dlat = radians(lat2 - lat1);
    dlon = radians(lon2 - lon1);

    a = sin(dlat/2) * sin(dlat/2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        sin(dlon/2) * sin(dlon/2);

    c = 2 * atan2(sqrt(a), sqrt(1-a));

    RETURN earth_radius * c;
END;
$$ LANGUAGE plpgsql;

-- Geo-fence check against nearest active office location
CREATE OR REPLACE FUNCTION check_geo_fence(
    check_lat DOUBLE PRECISION,
    check_lon DOUBLE PRECISION
) RETURNS TABLE (
    within_fence BOOLEAN,
    distance DOUBLE PRECISION,
    office_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        calculate_distance(check_lat, check_lon, ol.latitude, ol.longitude) <= ol.radius_meters,
        calculate_distance(check_lat, check_lon, ol.latitude, ol.longitude),
        ol.name
    FROM office_locations ol
    WHERE ol.is_active = TRUE
    ORDER BY calculate_distance(check_lat, check_lon, ol.latitude, ol.longitude)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Ensure default office location exists
INSERT INTO office_locations (name, latitude, longitude, radius_meters)
SELECT 'Main Office', 40.7128, -74.0060, 100
WHERE NOT EXISTS (SELECT 1 FROM office_locations WHERE name = 'Main Office');
