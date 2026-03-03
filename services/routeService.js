// services/routeService.js
const axios = require('axios'); // You'll need to install this
const NodeCache = require('node-cache');

const routeCache = new NodeCache({ 
  stdTTL: 86400,
  checkperiod: 3600,
  useClones: false
});

class RouteService {
  constructor() {
    this.apiKey = process.env.ORS_API_KEY;
    this.baseUrl = 'https://api.openrouteservice.org/v2';
    
    if (!this.apiKey) {
      console.error('❌ ORS_API_KEY not found in environment variables');
    } else {
      console.log('✅ RouteService initialized with ORS API');
    }
    
    this.apiCallCount = 0;
    this.lastResetDate = new Date().toDateString();
  }

  _getCacheKey(lat1, lng1, lat2, lng2) {
    const p1 = `${parseFloat(lat1).toFixed(4)},${parseFloat(lng1).toFixed(4)}`;
    const p2 = `${parseFloat(lat2).toFixed(4)},${parseFloat(lng2).toFixed(4)}`;
    const sorted = [p1, p2].sort();
    return `route:${sorted[0]}:${sorted[1]}`;
  }

  _checkAndResetCounter() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.apiCallCount = 0;
      this.lastResetDate = today;
    }
  }

  async getRoadDistance(lat1, lng1, lat2, lng2, options = {}) {
    try {
      if (!this._isValidCoordinate(lat1, lng1) || !this._isValidCoordinate(lat2, lng2)) {
        throw new Error('Invalid coordinates provided');
      }

      const cacheKey = this._getCacheKey(lat1, lng1, lat2, lng2);
      
      if (!options.forceFresh) {
        const cachedResult = routeCache.get(cacheKey);
        if (cachedResult) {
          return { ...cachedResult, cached: true, success: true };
        }
      }

      this._checkAndResetCounter();

      if (this.apiCallCount >= 1900) {
        return this._getFallbackDistance(lat1, lng1, lat2, lng2, 'API limit approaching');
      }

      console.log(`📍 Calling ORS API for road distance`);

      // Using axios for more reliable requests
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/directions/driving-car`,
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        data: {
          coordinates: [
            [parseFloat(lng1), parseFloat(lat1)],
            [parseFloat(lng2), parseFloat(lat2)]
          ],
          units: 'km',
          geometry: false,
          instructions: false
        }
      });

      this.apiCallCount++;

      if (!response.data || !response.data.routes || !response.data.routes[0]) {
        throw new Error('Invalid response from ORS API');
      }

      const distance = response.data.routes[0].summary.distance;
      const duration = response.data.routes[0].summary.duration;
      const durationMinutes = Math.round(duration / 60);

      console.log(`✅ ORS road distance: ${distance.toFixed(2)} km`);

      const result = {
        success: true,
        distance: parseFloat(distance.toFixed(2)),
        duration: durationMinutes,
        source: 'ors',
        timestamp: new Date().toISOString()
      };

      routeCache.set(cacheKey, result);
      return result;

    } catch (error) {
      console.error('❌ ORS API error:', error.message);
      if (error.response) {
        console.error('ORS Error Response:', error.response.data);
      }
      return this._getFallbackDistance(lat1, lng1, lat2, lng2, error.message);
    }
  }

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

  _isValidCoordinate(lat, lng) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return false;
    if (latNum < -90 || latNum > 90) return false;
    if (lngNum < -180 || lngNum > 180) return false;
    return true;
  }

  getApiStats() {
    this._checkAndResetCounter();
    return {
      callsToday: this.apiCallCount,
      remainingToday: 2000 - this.apiCallCount,
      limit: 2000,
      resetDate: this.lastResetDate,
      orsAvailable: !!this.apiKey
    };
  }

  async testConnection() {
    try {
      const result = await this.getRoadDistance(
        20.6952266, 83.488972,
        20.6852266, 83.498972,
        { forceFresh: true }
      );
      return result.success;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new RouteService();
