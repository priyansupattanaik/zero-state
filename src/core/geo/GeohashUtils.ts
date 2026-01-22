/**
 * Geohash Utility for Zero State
 * Converts GPS coordinates to characters for "Proximity Channels"
 */
export class GeohashUtils {
  private static BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

  static encode(lat: number, lon: number, precision: number = 5): string {
    let idx = 0; // index into base32 map
    let bit = 0; // each char holds 5 bits
    let evenBit = true;
    let geohash = "";

    let latMin = -90,
      latMax = 90;
    let lonMin = -180,
      lonMax = 180;

    while (geohash.length < precision) {
      if (evenBit) {
        // bisect E-W longitude
        const lonMid = (lonMin + lonMax) / 2;
        if (lon >= lonMid) {
          idx = idx * 2 + 1;
          lonMin = lonMid;
        } else {
          idx = idx * 2;
          lonMax = lonMid;
        }
      } else {
        // bisect N-S latitude
        const latMid = (latMin + latMax) / 2;
        if (lat >= latMid) {
          idx = idx * 2 + 1;
          latMin = latMid;
        } else {
          idx = idx * 2;
          latMax = latMid;
        }
      }
      evenBit = !evenBit;

      if (++bit === 5) {
        // 5 bits gives us a character: append it and start over
        geohash += this.BASE32.charAt(idx);
        bit = 0;
        idx = 0;
      }
    }

    return geohash;
  }
}
