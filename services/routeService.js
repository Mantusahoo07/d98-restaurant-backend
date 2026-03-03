// services/routeService.js
const Openrouteservice = require('openrouteservice-js');
const NodeCache = require('node-cache');

// Initialize cache with 24 hour TTL (time to live)
const routeCache = new NodeCache({ 
  stdTTL: 86400, // 24 hours in seconds
  checkperiod: 3600, // Check for expired keys every hour
  useClones: false
});

class RouteService {
  constructor() {
    this.apiKey = process.env.ORS_API_KEY;
    
    if (!this.apiKey) {
      console.error('❌ ORS_API_KEY not found in environment variables');
      throw new Error('ORS_API_KEY is required');
    }
    
    this.orsDirections = new Openrouteservice.Directions({ 
      api_key: this.apiKey 
    });
    
    this.orsMatrix = new Openrouteservice.Matrix({ 
      api_key: this.apiKey 
    });
    
    // Track API usage
    this.apiCallCount = 0;
    this.lastResetDate = new Date().toDateString();
    
    console.log('✅ RouteService initialized with ORS API');
  }

  /**
   * Generate cache key from coordinates
   * @private
   */
  _getCacheKey(lat1, lng1, lat2, lng2) {
    // Round to 4 decimal places (~11 meters precision) for efficient caching
    const p1 = `${parseFloat(lat1).toFixed(4)},${parseFloat(lng1).toFixed(4)}`;
    const p2 = `${parseFloat(lat2).toFixed(4)},${parseFloat(lng2).toFixed(4)}`;
    // Sort coordinates to make cache bidirectional (A->B same as B->A)
    const sorted = [p1, p2].sort();
    return `route:${sorted[0]}:${sorted[1]}`;
  }

  /**
   * Reset daily API call counter
   * @private
   */
  _checkAndResetCounter() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.apiCallCount = 0;
      this.lastResetDate = today;
      console.log('📊 API call counter reset for new day');
    }
  }

  /**
   * Get road distance between two points with caching
   * @param {number} lat1 - Origin latitude
   * @param {number} lng1 - Origin longitude
   * @param {number} lat2 - Destination latitude
   * @param {number} lng2 - Destination longitude
   * @param {Object} options - Additional options
   * @param {boolean} options.forceFresh - Skip cache and force fresh API call
   * @returns {Promise<Object>} Distance in km and duration in minutes
   */
  async getRoadDistance(lat1, lng1, lat2, lng2, options = {}) {
    try {
      // Validate coordinates
      if (!this._isValidCoordinate(lat1, lng1) || !this._isValidCoordinate(lat2, lng2)) {
        throw new Error('Invalid coordinates provided');
      }

      const cacheKey = this._getCacheKey(lat1, lng1, lat2, lng2);
      
      // Check cache first (unless forceFresh is true)
      if (!options.forceFresh) {
        const cachedResult = routeCache.get(cacheKey);
        if (cachedResult) {
          console.log(`📦 Cache hit for route ${cacheKey}`);
          return {
            ...cachedResult,
            cached: true,
            success: true
          };
        }
        console.log(`🆕 Cache miss for route ${cacheKey}`);
      }

      // Reset counter if needed
      this._checkAndResetCounter();

      // Check if we're approaching daily limit (1900 out of 2000)
      if (this.apiCallCount >= 1900) {
        console.warn(`⚠️ Approaching daily API limit (${this.apiCallCount}/2000). Using fallback.`);
        return this._getFallbackDistance(lat1, lng1, lat2, lng2, 'API limit approaching');
      }

      console.log(`📍 Calculating road distance from (${lat1},${lng1}) to (${lat2},${lng2})`);
      console.log(`📊 API calls today: ${this.apiCallCount + 1}/2000`);

      const response = await this.orsDirections.calculate({
        coordinates: [
          [parseFloat(lng1), parseFloat(lat1)], // ORS uses [lng, lat] order!
          [parseFloat(lng2), parseFloat(lat2)]
        ],
        profile: 'driving-car',
        format: 'json',
        units: 'km',
        geometry: false, // We don't need the route geometry
        instructions: false // We don't need turn-by-turn instructions
      });

      // Increment API call counter
      this.apiCallCount++;

      // Validate response
      if (!response || !response.routes || !response.routes[0] || !response.routes[0].summary) {
        throw new Error('Invalid response from ORS API');
      }

      // Extract distance and duration
      const distance = response.routes[0].summary.distance; // in km
      const duration = response.routes[0].summary.duration; // in seconds
      const durationMinutes = Math.round(duration / 60);

      console.log(`✅ Road distance: ${distance.toFixed(2)} km, Time: ${durationMinutes} min`);

      const result = {
        success: true,
        distance: parseFloat(distance.toFixed(2)),
        duration: durationMinutes,
        rawDistance: distance,
        rawDuration: duration,
        source: 'ors',
        timestamp: new Date().toISOString()
      };

      // Store in cache
      routeCache.set(cacheKey, result);
      console.log(`💾 Cached route for 24 hours: ${cacheKey}`);

      return result;

    } catch (error) {
      console.error('❌ ORS API error:', error.message);
      
      // Return fallback with error details
      return this._getFallbackDistance(lat1, lng1, lat2, lng2, error.message);
    }
  }

  /**
   * Calculate fallback straight-line distance
   * @private
   */
  _getFallbackDistance(lat1, lng1, lat2, lng2, errorMessage) {
    const straightDistance = this.calculateStraightLine(lat1, lng1, lat2, lng2);
    const estimatedTime = Math.round(straightDistance / 25 * 60); // Assume 25 km/h average
    
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
   * Calculate multiple distances at once (batch processing)
   * @param {Array} origins - Array of [lat, lng] origin points
   * @param {Array} destinations - Array of [lat, lng] destination points
   * @returns {Promise<Object>} Matrix of distances and durations
   */
  async getMultipleDistances(origins, destinations) {
    try {
      // Validate inputs
      if (!origins?.length || !destinations?.length) {
        throw new Error('Origins and destinations are required');
      }

      // Check cache first for each combination
      const results = [];
      const uncachedOrigins = [];
      const uncachedDestinations = [];
      const uncachedIndices = [];

      for (let i = 0; i < origins.length; i++) {
        for (let j = 0; j < destinations.length; j++) {
          const [lat1, lng1] = origins[i];
          const [lat2, lng2] = destinations[j];
          const cacheKey = this._getCacheKey(lat1, lng1, lat2, lng2);
          const cached = routeCache.get(cacheKey);
          
          if (cached) {
            results.push({
              originIndex: i,
              destinationIndex: j,
              ...cached,
              cached: true
            });
          } else {
            uncachedOrigins.push(origins[i]);
            uncachedDestinations.push(destinations[j]);
            uncachedIndices.push({ i, j });
          }
        }
      }

      // If all results were cached, return immediately
      if (uncachedOrigins.length === 0) {
        console.log(`📦 All ${results.length} distances served from cache`);
        return {
          success: true,
          results: results,
          cached: true
        };
      }

      // Reset counter if needed
      this._checkAndResetCounter();

      // Check API limits
      if (this.apiCallCount + 1 > 2000) {
        console.warn('⚠️ Daily API limit reached, using fallback for uncached routes');
        
        // Use fallback for uncached routes
        uncachedIndices.forEach(({ i, j }) => {
          const [lat1, lng1] = origins[i];
          const [lat2, lng2] = destinations[j];
          const fallback = this._getFallbackDistance(lat1, lng1, lat2, lng2, 'API limit reached');
          results.push({
            originIndex: i,
            destinationIndex: j,
            ...fallback
          });
        });

        return {
          success: true,
          results: results,
          partialCache: true,
          fallbackUsed: true
        };
      }

      // Format locations as [lng, lat] for ORS
      const locations = [
        ...uncachedOrigins.map(o => [parseFloat(o[1]), parseFloat(o[0])]),
        ...uncachedDestinations.map(d => [parseFloat(d[1]), parseFloat(d[0])])
      ];

      const sources = uncachedOrigins.map((_, index) => index);
      const targets = uncachedDestinations.map((_, index) => index + uncachedOrigins.length);

      console.log(`📍 Calculating ${uncachedOrigins.length}x${uncachedDestinations.length} distance matrix`);
      console.log(`📊 API calls today: ${this.apiCallCount + 1}/2000`);

      const response = await this.orsMatrix.calculate({
        locations: locations,
        profile: 'driving-car',
        sources: sources,
        destinations: targets,
        units: 'km',
        metrics: ['distance', 'duration']
      });

      this.apiCallCount++;

      // Process results
      for (let i = 0; i < uncachedIndices.length; i++) {
        const { i: origIdx, j: destIdx } = uncachedIndices[i];
        const [lat1, lng1] = origins[origIdx];
        const [lat2, lng2] = destinations[destIdx];
        
        const distance = response.distances[i][0];
        const duration = response.durations[i][0];
        const durationMinutes = Math.round(duration / 60);

        const result = {
          originIndex: origIdx,
          destinationIndex: destIdx,
          success: true,
          distance: parseFloat(distance.toFixed(2)),
          duration: durationMinutes,
          rawDistance: distance,
          rawDuration: duration,
          source: 'ors',
          timestamp: new Date().toISOString()
        };

        // Cache the result
        const cacheKey = this._getCacheKey(lat1, lng1, lat2, lng2);
        routeCache.set(cacheKey, result);

        results.push(result);
      }

      return {
        success: true,
        results: results,
        cached: false
      };

    } catch (error) {
      console.error('❌ ORS Matrix error:', error);
      
      // Fallback to straight-line for all combinations
      const results = [];
      for (let i = 0; i < origins.length; i++) {
        for (let j = 0; j < destinations.length; j++) {
          const [lat1, lng1] = origins[i];
          const [lat2, lng2] = destinations[j];
          const fallback = this._getFallbackDistance(lat1, lng1, lat2, lng2, error.message);
          results.push({
            originIndex: i,
            destinationIndex: j,
            ...fallback
          });
        }
      }

      return {
        success: false,
        results: results,
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * Calculate straight-line distance (Haversine formula)
   * @param {number} lat1 - Origin latitude
   * @param {number} lng1 - Origin longitude
   * @param {number} lat2 - Destination latitude
   * @param {number} lng2 - Destination longitude
   * @returns {number} Distance in kilometers
   */
  calculateStraightLine(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
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
   * @private
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
   * @returns {Object} Cache stats
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
   * @returns {Object} API usage stats
   */
  getApiStats() {
    this._checkAndResetCounter();
    return {
      callsToday: this.apiCallCount,
      remainingToday: 2000 - this.apiCallCount,
      limit: 2000,
      resetDate: this.lastResetDate
    };
  }

  /**
   * Test API connection
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      const result = await this.getRoadDistance(
        20.6952266, 83.488972,  // Restaurant
        20.6951918, 83.4889397,  // Test point
        { forceFresh: true } // Skip cache for test
      );
      return result.success;
    } catch (error) {
      console.error('ORS connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new RouteService();
