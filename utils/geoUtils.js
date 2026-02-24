/**
 * Production Hardened Geo Utilities
 * Enforces strict TYPE checking, RANGE validation, and FINITE numbers.
 */

/**
 * Validates Latitude and Longitude with strict type coercion and range checks.
 * @param {string|number} latitude 
 * @param {string|number} longitude 
 * @returns {Object|null} Returns normalized { lat: number, lng: number } or null if invalid
 */
const validateCoordinates = (latitude, longitude) => {
    // 1. Coercion
    const lat = Number(latitude);
    const lng = Number(longitude);

    // 2. Finite Check (Rejects Infinity, NaN, null, undefined)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    // 3. Range Validation
    if (lat < -90 || lat > 90) return null;
    if (lng < -180 || lng > 180) return null;

    return { lat, lng };
};

/**
 * Calculates distance between two points using Haversine formula.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in meters
 */
const calculateDistanceInMeters = (lat1, lon1, lat2, lon2) => {
    // Ensure inputs are numbers (sanity check, though validateCoordinates should be called first)
    const R = 6371000; // Earth radius in meters
    const toRadians = (degree) => degree * (Math.PI / 180);

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

/**
 * Checks if user is within branch radius with Float Precision Guard.
 * @param {string|number} userLat 
 * @param {string|number} userLng 
 * @param {string|number} branchLat 
 * @param {string|number} branchLng 
 * @param {number} radiusInMeters 
 * @returns {Object} { within: boolean, distance: number, normalizedUserLat: number, normalizedUserLng: number }
 * @throws {Error} if inputs invalid
 */
const isWithinRadius = (userLat, userLng, branchLat, branchLng, radiusInMeters) => {
    // A. Validate User Coords
    const userCoords = validateCoordinates(userLat, userLng);
    if (!userCoords) {
        throw new Error(`Invalid User Coordinates: lat=${userLat}, lng=${userLng}`);
    }

    // B. Validate Branch Coords
    const branchCoords = validateCoordinates(branchLat, branchLng);
    if (!branchCoords) {
        throw new Error(`Invalid Branch Coordinates: lat=${branchLat}, lng=${branchLng}`);
    }

    // C. Validate Radius
    const radius = Number(radiusInMeters);
    if (!Number.isFinite(radius) || radius < 10) {
        throw new Error(`Invalid Radius: ${radiusInMeters}. Must be >= 10 meters.`);
    }

    // D. Calculate
    const distance = calculateDistanceInMeters(
        userCoords.lat,
        userCoords.lng,
        branchCoords.lat,
        branchCoords.lng
    );

    // E. Epsilon Guard (Distance <= Radius + 0.0001)
    const within = distance <= (radius + 0.0001);

    return {
        within,
        distance,
        normalizedUserLat: userCoords.lat,
        normalizedUserLng: userCoords.lng
    };
};

module.exports = { validateCoordinates, calculateDistanceInMeters, isWithinRadius };
