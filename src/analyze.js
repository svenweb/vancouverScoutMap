//input: coordinates of a point to be sound analyzed
//output: A text summary of potential sound pollution sources, and geometries to show on the map.


export const analyze = async (point, radius, time_interval) => {
    //Process Facilities noise data
        
        //1. Collect the facilities data from openstreetmap api with the point and radius
        const facilities = await fetchFacilities(point, radius);
        //2. output csv of the facilities within the radius including facilities data and distance to the point
        // const facilitiesCSV = facilities.map(facility => {
        //     return {
        //         facility_name: facility.tags.name,
        //         facility_type: facility.tags.amenity,
        //         distance: facility.distance
        //     }
        // })


    //Query the traffic road ahead data from vancouver city api
    //Check for any geometry that intersects within the radius of the point
    //collect data about intersections and save for gemini api.
    const constructionSites = await fetchConstructionProjects(point, radius);
    // const constructionSitesCSV = constructionSites.map(constructionSite => {
    //     return {
    //         construction_site_name: constructionSite.tags.name,
    //         construction_site_type: constructionSite.tags.construction,
    //         distance: constructionSite.distance
    //     }
    // })


    //Gemini prompt:
      // here is all the data, summarize the potential sound pollution.
      // indicate if the time interval is during 8-9am or 3-4pm and there are school facilities.
      console.log(facilities);
      console.log(constructionSites);
    
}

// Fetch data from Overpass API
const fetchFacilities = async (point ={lat: 49.2827, lon: -123.1207}, radius = 1000) => {
    // Set defaults if not provided
    if (!point) {
      point = { lat: 49.2827, lon: -123.1207 };
    }
    if (!radius) {
      radius = 1000;
    }
    
    console.log('Point:', point, 'Radius:', radius);
    
    // Validate inputs
    if (!point.lat || !point.lon) {
      throw new Error('Invalid point coordinates');
    }
    
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
    
    // Debug: log the actual query
    console.log('Overpass Query:', overpassQuery);
    
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Overpass API Error:', errorText);
        throw new Error('Failed to fetch data from Overpass API');
      }
      
      const data = await response.json();
      return data.elements;
    } catch (err) {
      console.error('Fetch error:', err);
      throw err;
    }
  };


  const fetchConstructionProjects = async (point, radius) => {
    // Set defaults if not provided
    if (!point) {
      point = { lat: 49.2827, lon: -123.1207 };
    }
    if (!radius) {
      radius = 1000;
    }
    
    console.log('Fetching construction projects for point:', point, 'radius:', radius);
    
    // Create the geometry literal - POINT(longitude latitude) - longitude first!
    const geometryLiteral = `GEOM'POINT(${point.lon} ${point.lat})'`;
    
    // Create the WHERE clause with within_distance
    const whereClause = `within_distance(geo_point_2d, ${geometryLiteral}, ${radius}m)`;
    
    const baseUrl = 'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/road-ahead-upcoming-projects/records';
    
    const params = new URLSearchParams({
      where: whereClause,
      limit: 100
    });
    
    const url = `${baseUrl}?${params}`;
    
    console.log('Construction API URL:', url);
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Vancouver Open Data API Error:', errorText);
        throw new Error('Failed to fetch construction data from Vancouver Open Data');
      }
      
      const data = await response.json();
      console.log(`Found ${data.total_count} construction projects within ${radius}m`);
      return data.results;
    } catch (err) {
      console.error('Fetch error:', err);
      throw err;
    }
  };
    // Process the results
    // const projects = data.results.map(record => ({
    //   project: record.project,
    //   location: record.location,
    //   completionDate: record.comp_date,
    //   coordinates: {
    //     lat: record.geo_point_2d.lat,
    //     lon: record.geo_point_2d.lon
    //   },
    //   geometry: record.geom
    // }));
    
    // return {
    //   total: data.total_count,
    //   projects: projects
    // };
  
  
