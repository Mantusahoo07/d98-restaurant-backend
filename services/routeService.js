// services/routeService.js
const Openrouteservice = require('openrouteservice-js');

class RouteService {
  constructor() {
    this.apiKey = process.env.ORS_API_KEY;
    this.orsDirections = new Openrouteservice.Directions({ 
      api_key: this.apiKey 
    });
    this.orsMatrix = new Openrouteservice.Matrix({ 
      api_key: this.apiKey 
    });
  }

  /**
   * Get road distance between two points
   * @param {number} lat1 - Origin latitude
   * @param {number} lng1 - Origin longitude
   * @param {number} lat2 - Destination latitude
   * @param {number} lng2 - Destination longitude
   * @returns {Promise<Object>} Distance in km and duration in minutes
   */
  async getRoadDistance(lat1, lng1, lat2, lng2) {
    try {
      console.log(`📍 Calculating road distance from (${lat1},${lng1}) to (${lat2},${lng2})`);
      
      const response = await this.orsDirections.calculate({
        coordinates: [
          [lng1, lat1],  // IMPORTANT: ORS uses [lng, lat] order!
          [lng2, lat2]
        ],
        profile: 'driving-car',
        format: 'json',
        units: 'km',
        geometry: false  // We don't need the route geometry
      });

      // Extract distance and duration
      const distance = response.routes[0].summary.distance; // in km
      const duration = response.routes[0].summary.duration; // in seconds
      const durationMinutes = Math.round(duration / 60);

      console.log(`✅ Road distance: ${distance.toFixed(2)} km, Time: ${durationMinutes} min`);

      return {
        success: true,
        distance: distance,
        duration: durationMinutes,
        raw: response
      };

    } catch (error) {
      console.error('❌ ORS API error:', error.message);
      
      // Fallback to straight-line distance
      const straightDistance = this.calculateStraightLine(lat1, lng1, lat2, lng2);
      const estimatedTime = Math.round(straightDistance / 25 * 60); // Assume 25 km/h
      
      console.warn(`⚠️ Falling back to straight-line: ${straightDistance.toFixed(2)} km`);
      
      return {
        success: false,
        distance: straightDistance,
        duration: estimatedTime,
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * Calculate multiple distances at once (e.g., for multiple agents)
   * @param {Array} origins - Array of [lat, lng] origin points
   * @param {Array} destinations - Array of [lat, lng] destination points
   */
  async getMultipleDistances(origins, destinations) {
    try {
      // Format locations as [lng, lat] for ORS
      const locations = [
        ...origins.map(o => [o[1], o[0]]),  // Convert [lat,lng] to [lng,lat]
        ...destinations.map(d => [d[1], d[0]])
      ];

      const sources = origins.map((_, index) => index);
      const targets = destinations.map((_, index) => index + origins.length);

      const response = await this.orsMatrix.calculate({
        locations: locations,
        profile: 'driving-car',
        sources: sources,
        destinations: targets,
        units: 'km'
      });

      return {
        success: true,
        distances: response.distances,
        durations: response.durations
      };

    } catch (error) {
      console.error('❌ ORS Matrix error:', error);
      throw error;
    }
  }

  /**
   * Calculate straight-line distance (fallback)
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
   * Check if API key is valid
   */
  async testConnection() {
    try {
      // Test with a simple route
      const result = await this.getRoadDistance(
        20.6952266, 83.488972,  // Restaurant
        20.6951918, 83.4889397  // Test point
      );
      return result.success;
    } catch (error) {
      console.error('ORS connection test failed:', error);
      return false;
    }
  }
}

module.exports = new RouteService();
