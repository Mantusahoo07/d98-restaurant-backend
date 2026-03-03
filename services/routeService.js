// services/routeService.js
const Openrouteservice = require('openrouteservice-js');
const NodeCache = require('node-cache');

// Initialize cache with 24 hour TTL
const routeCache = new NodeCache({ 
  stdTTL: 86400, // 24 hours in seconds
  checkperiod: 3600,
  useClones: false
});

class RouteService {
  constructor() {
    this.apiKey = process.env.ORS_API_KEY;
    
    if (!this.apiKey) {
      console.error('❌ ORS_API_KEY not found in environment variables');
      // Don't throw error, just log and continue with fallback
      console.warn('⚠️ RouteService will use straight-line fallback only');
      this.orsDirections = null;
      this.orsMatrix = null;
    } else {
      try {
        this.orsDirections = new Openrouteservice.Directions({ 
          api_key: this.apiKey 
        });
        
        this.orsMatrix = new Openrouteservice.Matrix({ 
          api_key: this.apiKey 
        });
        
        console.log('✅ RouteService initialized with ORS API');
      } catch (error) {
        console.error('❌ Failed to initialize ORS:', error);
        this.orsDirections = null;
        this.orsMatrix = null;
      }
    }
    
    // Track API usage
    this.apiCallCount = 0;
    this.lastResetDate = new Date().toDateString();
  }

  /**
   * Generate cache key from coordinates
   */
  _getCacheKey(lat1, lng1, lat2, lng2) {
    const p1 = `${parseFloat(lat1).toFixed(4)},${parseFloat(lng1).toFixed(4)}`;
    const p2 = `${parseFloat(lat2).toFixed(4)},${parseFloat(lng2).toFixed(4)}`;
    const sorted = [p1, p2].sort();
    return `route:${sorted[0]}:${sorted[1]}`;
  }

  /**
   * Reset daily API call counter
   */
  _checkAndResetCounter() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.apiCallCount = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * Get road distance between two points with caching
   */
  async getRoadDistance(lat1, lng1, lat2, lng2, options = {}) {
    try {
      // Validate coordinates
      if (!this._isValidCoordinate(lat1, lng1) || !this._isValidCoordinate(lat2, lng2)) {
        throw new Error('Invalid coordinates provided');
      }

      const cacheKey = this._getCacheKey(lat1, lng1, lat2, lng2);
      
      // Check cache first
      if (!options.forceFresh) {
        const cachedResult = routeCache.get(cacheKey);
        if (cachedResult) {
          console.log(`📦 Cache hit for route`);
          return {
            ...cachedResult,
            cached: true,
            success: true
          };
        }
      }

      // If ORS is not available, use fallback
      if (!this.orsDirections) {
        return this._getFallbackDistance(lat1, lng1, lat2, lng2, 'ORS not initialized');
      }

      // Reset counter if needed
      this._checkAndResetCounter();

      // Check daily limit
      if (this.apiCallCount >= 1900) {
        console.warn(`⚠️ Approaching daily API limit`);
        return this._getFallbackDistance(lat1, lng1, lat2, lng2, 'API limit approaching');
      }

      console.log(`📍 Calculating road distance`);

      const response = await this.orsDirections.calculate({
        coordinates: [
          [parseFloat(lng1), parseFloat(lat1)],
          [parseFloat(lng2), parseFloat(lat2)]
        ],
        profile: 'driving-car',
        format: 'json',
        units: 'km',
        geometry: false,
        instructions: false
      });

      this.apiCallCount++;

      if (!response || !response.routes || !response.routes[0]) {
        throw new Error('Invalid response from ORS API');
      }

      const distance = response.routes[0].summary.distance;
      const duration = response.routes[0].summary.duration;
      const durationMinutes = Math.round(duration / 60);

      console.log(`✅ Road distance: ${distance.toFixed(2)} km, Time: ${durationMinutes} min`);

      const result = {
        success: true,
        distance: parseFloat(distance.toFixed(2)),
        duration: durationMinutes,
        source: 'ors',
        timestamp: new Date().toISOString()
      };

      // Cache the result
      routeCache.set(cacheKey, result);
      console.log(`💾 Cached route for 24 hours`);

      return result;

    } catch (error) {
      console.error('❌ ORS API error:', error.message);
      return this._getFallbackDistance(lat1, lng1, lat2, lng2, error.message);
    }
  }

  /**
   * Calculate fallback straight-line distance
   */
  _getFallbackDistance(lat1, lng1, lat2, lng2, errorMessage) {
    const straightDistance = this.calculateStraightLine(lat1, lng1, lat2, lng2);
    const estimatedTime = Math.round(straightDistance / 25 * 60);
    
    console.warn(`⚠️ Using fallback straight-line: ${straightDistance.toFixed(2)} km`);
    
    return {
      success: false,
      distance: parseFloat(straightDistance.toFixed(2)),
      duration: estimatedTime,
      error: errorMessage,
      fallback: true,
      source: 'straight-line',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate straight-line distance (Haversine formula)
   */
  calculateStraightLine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Validate coordinates
   */
  _isValidCoordinate(lat, lng) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    
    if (isNaN(latNum) || isNaN(lngNum)) return false;
    if (latNum < -90 || latNum > 90) return false;
    if (lngNum < -180 || lngNum > 180) return false;
    
    return true;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      keys: routeCache.keys(),
      stats: routeCache.getStats(),
      size: routeCache.keys().length
    };
  }

  /**
   * Clear the entire cache
   */
  clearCache() {
    routeCache.flushAll();
    console.log('🧹 Route cache cleared');
  }

  /**
   * Get API usage statistics
   */
  getApiStats() {
    this._checkAndResetCounter();
    return {
      callsToday: this.apiCallCount,
      remainingToday: 2000 - this.apiCallCount,
      limit: 2000,
      resetDate: this.lastResetDate,
      orsAvailable: !!this.orsDirections
    };
  }
}

module.exports = new RouteService();
