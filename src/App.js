import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const FacilitiesMap = () => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({});
  const [visibleLayers, setVisibleLayers] = useState({
    hospitals: true,
    fire_stations: true,
    police_stations: true,
    airports: true,
    elementary_schools: true,
    high_schools: true,
    other_schools: true,
  });
  const [analyzing, setAnalyzing] = useState(false);

  // Custom icons for different facility types
  const icons = useMemo(() => ({
    hospital: L.divIcon({
      html: '<div style="background: #ef4444; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">H</div>',
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    fire_station: L.divIcon({
      html: '<div style="background: #f97316; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">F</div>',
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    police: L.divIcon({
      html: '<div style="background: #3b82f6; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">P</div>',
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    airport: L.divIcon({
      html: '<div style="background: #8b5cf6; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">A</div>',
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    elementary_school: L.divIcon({
      html: '<div style="background: #10b981; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">ES</div>',
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    high_school: L.divIcon({
      html: '<div style="background: #059669; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">HS</div>',
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    other_school: L.divIcon({
      html: '<div style="background: #14b8a6; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">S</div>',
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
  }), []);

  const addMarker = useCallback((facility, category, iconType, typeLabel) => {
    const marker = L.marker([facility.lat, facility.lon], {
      icon: icons[iconType],
    });

    const name = facility.tags.name || 'Unnamed';
    const address = facility.tags['addr:full'] || facility.tags['addr:street'] || 'Address not available';
    
    marker.bindPopup(`
      <div style="font-family: sans-serif;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px;">${name}</h3>
        <p style="margin: 4px 0; color: #666; font-size: 14px;"><strong>Type:</strong> ${typeLabel}</p>
        <p style="margin: 4px 0; color: #666; font-size: 14px;"><strong>Address:</strong> ${address}</p>
      </div>
    `);

    markersRef.current[category].addLayer(marker);
  }, [icons]);

  const processFacilities = useCallback((elements) => {
    // Clear existing markers
    Object.values(markersRef.current).forEach(layer => layer.clearLayers());

    const facilities = {
      hospitals: [],
      fire_stations: [],
      police_stations: [],
      airports: [],
      elementary_schools: [],
      high_schools: [],
      other_schools: [],
    };

    // Create a map to store way/relation nodes
    const nodeMap = {};
    elements.forEach(el => {
      if (el.type === 'node') {
        nodeMap[el.id] = el;
      }
    });

    elements.forEach(element => {
      if (!element.tags) return;

      const tags = element.tags;
      let lat, lon;

      // Get coordinates
      if (element.type === 'node') {
        lat = element.lat;
        lon = element.lon;
      } else if (element.type === 'way' && element.center) {
        lat = element.center.lat;
        lon = element.center.lon;
      } else if (element.type === 'relation' && element.center) {
        lat = element.center.lat;
        lon = element.center.lon;
      } else {
        // Calculate centroid for ways without center
        if (element.type === 'way' && element.nodes) {
          let sumLat = 0, sumLon = 0, count = 0;
          element.nodes.forEach(nodeId => {
            if (nodeMap[nodeId]) {
              sumLat += nodeMap[nodeId].lat;
              sumLon += nodeMap[nodeId].lon;
              count++;
            }
          });
          if (count > 0) {
            lat = sumLat / count;
            lon = sumLon / count;
          }
        }
      }

      if (!lat || !lon) return;

      const facility = { ...element, lat, lon };

      // Categorize facilities
      if (tags.amenity === 'hospital') {
        facilities.hospitals.push(facility);
        addMarker(facility, 'hospitals', 'hospital', 'Hospital');
      } else if (tags.amenity === 'fire_station') {
        facilities.fire_stations.push(facility);
        addMarker(facility, 'fire_stations', 'fire_station', 'Fire Station');
      } else if (tags.amenity === 'police') {
        facilities.police_stations.push(facility);
        addMarker(facility, 'police_stations', 'police', 'Police Station');
      } else if (tags.aeroway === 'aerodrome') {
        facilities.airports.push(facility);
        addMarker(facility, 'airports', 'airport', 'Airport');
      } else if (tags.amenity === 'school') {
        const schoolType = tags['isced:level'] || '';
        const schoolTag = (tags.school || '').toLowerCase();
        
        if (schoolType.includes('1') || schoolTag.includes('elementary') || schoolTag.includes('primary')) {
          facilities.elementary_schools.push(facility);
          addMarker(facility, 'elementary_schools', 'elementary_school', 'Elementary School');
        } else if (schoolType.includes('3') || schoolTag.includes('secondary') || schoolTag.includes('high')) {
          facilities.high_schools.push(facility);
          addMarker(facility, 'high_schools', 'high_school', 'High School');
        } else {
          facilities.other_schools.push(facility);
          addMarker(facility, 'other_schools', 'other_school', 'School');
        }
      }
    });

    // Update statistics
    const newStats = {};
    Object.keys(facilities).forEach(key => {
      newStats[key] = facilities[key].length;
    });
    setStats(newStats);
  }, [addMarker]);

  useEffect(() => {
    // Initialize map
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView([49.25, -123.1], 12);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);

      // Initialize layer groups
      markersRef.current = {
        hospitals: L.layerGroup().addTo(mapInstanceRef.current),
        fire_stations: L.layerGroup().addTo(mapInstanceRef.current),
        police_stations: L.layerGroup().addTo(mapInstanceRef.current),
        airports: L.layerGroup().addTo(mapInstanceRef.current),
        elementary_schools: L.layerGroup().addTo(mapInstanceRef.current),
        high_schools: L.layerGroup().addTo(mapInstanceRef.current),
        other_schools: L.layerGroup().addTo(mapInstanceRef.current),
      };
    }

    // Fetch data from Overpass API
    const fetchFacilities = async () => {
      setLoading(true);
      setError(null);

      const overpassQuery = `
        [out:json];
        area["name"="Vancouver"]["admin_level"="8"]->.searchArea;
        (
          node["amenity"="hospital"](area.searchArea);
          way["amenity"="hospital"](area.searchArea);
          relation["amenity"="hospital"](area.searchArea);
          
          node["amenity"="fire_station"](area.searchArea);
          way["amenity"="fire_station"](area.searchArea);
          relation["amenity"="fire_station"](area.searchArea);
          
          node["amenity"="police"](area.searchArea);
          way["amenity"="police"](area.searchArea);
          relation["amenity"="police"](area.searchArea);
          
          node["aeroway"="aerodrome"](area.searchArea);
          way["aeroway"="aerodrome"](area.searchArea);
          relation["aeroway"="aerodrome"](area.searchArea);
          
          node["amenity"="school"](area.searchArea);
          way["amenity"="school"](area.searchArea);
          relation["amenity"="school"](area.searchArea);
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
        processFacilities(data.elements);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchFacilities();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [processFacilities]);


  const toggleLayer = (category) => {
    const newVisibleLayers = { ...visibleLayers, [category]: !visibleLayers[category] };
    setVisibleLayers(newVisibleLayers);

    if (newVisibleLayers[category]) {
      mapInstanceRef.current.addLayer(markersRef.current[category]);
    } else {
      mapInstanceRef.current.removeLayer(markersRef.current[category]);
    }
  };

  const categoryLabels = {
    hospitals: 'Hospitals',
    fire_stations: 'Fire Stations',
    police_stations: 'Police Stations',
    airports: 'Airports',
    elementary_schools: 'Elementary Schools',
    high_schools: 'High Schools',
    other_schools: 'Other Schools',
  };

  const categoryColors = {
    hospitals: '#ef4444',
    fire_stations: '#f97316',
    police_stations: '#3b82f6',
    airports: '#8b5cf6',
    elementary_schools: '#10b981',
    high_schools: '#059669',
    other_schools: '#14b8a6',
  };

  const handleAnalyze = () => {
    setAnalyzing(true);
    // Simulate analysis process
    setTimeout(() => {
      setAnalyzing(false);
    }, 3000);
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ 
        padding: '16px', 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>Vancouver Facilities Map</h1>
        <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
          Interactive map showing hospitals, emergency services, airports, and schools
        </p>
      </div>

      {loading && (
        <div style={{ 
          padding: '16px', 
          background: '#3b82f6', 
          color: 'white', 
          textAlign: 'center',
          fontSize: '14px'
        }}>
          Loading facilities from OpenStreetMap...
        </div>
      )}

      {error && (
        <div style={{ 
          padding: '16px', 
          background: '#ef4444', 
          color: 'white', 
          textAlign: 'center',
          fontSize: '14px'
        }}>
          Error: {error}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ 
          width: '280px', 
          padding: '16px', 
          background: '#f8fafc',
          overflowY: 'auto',
          borderRight: '1px solid #e2e8f0'
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#1e293b' }}>Analysis Tools</h2>
          
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: analyzing ? '#94a3b8' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: analyzing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {analyzing ? (
              <>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #ffffff40',
                  borderTop: '2px solid #ffffff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                Analyzing...
              </>
            ) : (
              'Analyze Facilities'
            )}
          </button>

          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '8px',
            fontSize: '12px',
            color: '#64748b'
          }}>
            <strong style={{ color: '#1e293b' }}>Total Facilities:</strong> {Object.values(stats).reduce((a, b) => a + b, 0)}
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
              Data from OpenStreetMap via Overpass API
            </div>
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          
          {/* Layer Controls in top-right corner */}
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'white',
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: '200px'
          }}>
            <h3 style={{ 
              margin: '0 0 12px 0', 
              fontSize: '14px', 
              color: '#1e293b',
              fontWeight: '600'
            }}>
              Layer Controls
            </h3>
            
            {Object.keys(visibleLayers).map(category => (
              <div 
                key={category}
                onClick={() => toggleLayer(category)}
                style={{
                  padding: '8px',
                  marginBottom: '6px',
                  background: visibleLayers[category] ? '#f8fafc' : 'transparent',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: `1px solid ${visibleLayers[category] ? categoryColors[category] : '#e2e8f0'}`,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: categoryColors[category],
                    opacity: visibleLayers[category] ? 1 : 0.3,
                  }}></div>
                  <span style={{ 
                    fontSize: '12px', 
                    fontWeight: visibleLayers[category] ? '600' : '400',
                    color: visibleLayers[category] ? '#1e293b' : '#64748b'
                  }}>
                    {categoryLabels[category]}
                  </span>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: categoryColors[category],
                  background: `${categoryColors[category]}20`,
                  padding: '2px 6px',
                  borderRadius: '10px'
                }}>
                  {stats[category] || 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacilitiesMap;