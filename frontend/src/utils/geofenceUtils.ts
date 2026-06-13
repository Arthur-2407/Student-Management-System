interface Location {
  latitude: number;
  longitude: number;
}

interface GeoFence {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

interface GeoFenceResult {
  withinFence: boolean;
  distance: number;
  officeName: string;
}

// Calculate distance between two points using Haversine formula
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

// Check if location is within geo-fence
export const checkGeoFence = (
  location: Location,
  geoFence: GeoFence,
  officeName: string = 'Main Office'
): GeoFenceResult => {
  const distance = calculateDistance(
    location.latitude,
    location.longitude,
    geoFence.latitude,
    geoFence.longitude
  );

  return {
    withinFence: distance <= geoFence.radiusMeters,
    distance,
    officeName,
  };
};

// Format distance for display
export const formatDistance = (distance: number): string => {
  if (distance < 1000) {
    return `${Math.round(distance)} meters`;
  } else {
    return `${(distance / 1000).toFixed(2)} km`;
  }
};

// Get geo-fence status color
export const getGeoFenceStatusColor = (withinFence: boolean): string => {
  return withinFence ? 'text-green-600' : 'text-red-600';
};

// Get geo-fence status text
export const getGeoFenceStatusText = (withinFence: boolean): string => {
  return withinFence ? 'Within Office Radius' : 'Outside Office Radius';
};

// Default office location (New York City coordinates)
export const DEFAULT_OFFICE_LOCATION: GeoFence = {
  latitude: 40.7128,
  longitude: -74.006,
  radiusMeters: 100,
};