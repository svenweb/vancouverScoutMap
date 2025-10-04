//input: coordinates of a point to be sound analyzed
//output: A text summary of potential sound pollution sources, and geometries to show on the map.


const analyze = async (point, radius, time_interval) => {
    //Process Facilities noise data
        
        //1. Collect the facilities data from openstreetmap api with the point and radius
        const facilities = await fetchFacilities(point, radius);
        //2. output csv of the facilities within the radius including facilities data and distance to the point
        const facilitiesCSV = facilities.map(facility => {
            return {
                facility_name: facility.tags.name,
                facility_type: facility.tags.amenity,
                distance: facility.distance
            }
        })

        
    //Query the traffic road ahead data from vancouver city api
    //Check for any geometry that intersects within the radius of the point
    //collect data about intersections and save for gemini api.



    //Gemini prompt:
      // here is all the data, summarize the potential sound pollution.
      // indicate if the time interval is during 8-9am or 3-4pm and there are school facilities.
    
}


// Fetch data from Overpass API
const fetchFacilities = async (point, radius) => {
    const overpassQuery = `
      [out:json];
      (
        node["amenity"="hospital"](around:${radius},${point.lat},${point.lon});
        way["amenity"="hospital"](around:${radius},${point.lat},${point.lon});
        relation["amenity"="hospital"](around:${radius},${point.lat},${point.lon});
        
        node["amenity"="fire_station"](around:${radius},${point.lat},${point.lon});
        way["amenity"="fire_station"](around:${radius},${point.lat},${point.lon});
        relation["amenity"="fire_station"](around:${radius},${point.lat},${point.lon});
        
        node["amenity"="police"](around:${radius},${point.lat},${point.lon});
        way["amenity"="police"](around:${radius},${point.lat},${point.lon});
        relation["amenity"="police"](around:${radius},${point.lat},${point.lon});
        
        node["aeroway"="aerodrome"](around:${radius},${point.lat},${point.lon});
        way["aeroway"="aerodrome"](around:${radius},${point.lat},${point.lon});
        relation["aeroway"="aerodrome"](around:${radius},${point.lat},${point.lon});
        
        node["amenity"="school"](around:${radius},${point.lat},${point.lon});
        way["amenity"="school"](around:${radius},${point.lat},${point.lon});
        relation["amenity"="school"](around:${radius},${point.lat},${point.lon});
      );
      out body;
      >;
      out skel qt;
    `;
    
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch data from Overpass API');
      }
      
      const data = await response.json();
      return data.elements;
    } catch (err) {
      //setError(err.message);
      throw err; // Re-throw so caller can handle it
    } finally {
      //setLoading(false);
    }
  };
