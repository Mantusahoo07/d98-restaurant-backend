// Simple in-memory cache
const cache = {};

class RouteCacheService {
  getKey(lat1, lng1, lat2, lng2) {
    // Round to 4 decimal places (~11 meters) for caching
    const p1 = `${lat1.toFixed(4)},${lng1.toFixed(4)}`;
    const p2 = `${lat2.toFixed(4)},${lng2.toFixed(4)}`;
    return `route:${p1}:${p2}`;
  }

  get(lat1, lng1, lat2, lng2) {
    const key = this.getKey(lat1, lng1, lat2, lng2);
    const cached = cache[key];
    if (cached && cached.expiry > Date.now()) {
      return cached.distance;
    }
    return null;
  }

  set(lat1, lng1, lat2, lng2, distance) {
    const key = this.getKey(lat1, lng1, lat2, lng2);
    cache[key] = {
      distance: distance,
      expiry: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
  }

  // Optional: Add method to clear cache
  clear() {
    Object.keys(cache).forEach(key => delete cache[key]);
  }
}

module.exports = new RouteCacheService();
