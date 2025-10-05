import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import { analyze } from './analyze';

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
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState(200);
  const [timeWindowDays, setTimeWindowDays] = useState('');
  const [timeWindowHours, setTimeWindowHours] = useState('');
  const [isDroppingPin, setIsDroppingPin] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);

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

  const handleMapClick = useCallback((e) => {
    if (isDroppingPin) {
      const { lat, lng } = e.latlng;
      setLatitude(lat.toFixed(6));
      setLongitude(lng.toFixed(6));
      setIsDroppingPin(false);
      
      // Reset cursor
      if (mapInstanceRef.current) {
        mapInstanceRef.current.getContainer().style.cursor = '';
      }

      // Add or update pin marker
      if (selectedPin) {
        mapInstanceRef.current.removeLayer(selectedPin);
      }
      
      const pinIcon = L.divIcon({
        html: '<div style="background: #ef4444; width: 20px; height: 20px; border-radius: 50% 50% 50% 0; border: 2px solid white; transform: rotate(-45deg); box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 20],
      });

      const newPin = L.marker([lat, lng], { icon: pinIcon }).addTo(mapInstanceRef.current);
      setSelectedPin(newPin);
    }
  }, [isDroppingPin, selectedPin]);

  useEffect(() => {
    // Initialize map
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView([49.25, -123.1], 12);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);

      // Add click event listener for pin dropping
      mapInstanceRef.current.on('click', handleMapClick);

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
  }, [processFacilities, handleMapClick]);


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

  const handleAnalyze = async () => {
    setAnalyzing(true);
    console.log(latitude, longitude, radius);
    // Simulate analysis process
    await analyze({lat: latitude, lon: longitude}, radius);
    setAnalyzing(false);
  };

  const handleDropPin = () => {
    setIsDroppingPin(true);
    // Change cursor to indicate pin dropping mode
    if (mapInstanceRef.current) {
      mapInstanceRef.current.getContainer().style.cursor = 'crosshair';
    }
  };

  const clearPin = () => {
    if (selectedPin) {
      mapInstanceRef.current.removeLayer(selectedPin);
      setSelectedPin(null);
    }
    setLatitude('');
    setLongitude('');
    setIsDroppingPin(false);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.getContainer().style.cursor = '';
    }
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#f1f5f9' }}>
      <div style={{
        padding: '20px 24px',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        boxShadow: '0 2px 12px rgba(15, 23, 42, 0.08)',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>Vancouver Facilities Map</h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#475569' }}>
          Explore emergency services, hospitals, airports, and schools across the city
        </p>
      </div>

      {loading && (
        <div style={{
          padding: '12px 24px',
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
          padding: '12px 24px',
          background: '#ef4444',
          color: 'white',
          textAlign: 'center',
          fontSize: '14px'
        }}>
          Error: {error}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: '24px', gap: '24px' }}>
        <div className="sidebar-panel">
          <div className="sidebar-card">
            <h2>Add location</h2>

            <label className="field-label">Address or place</label>
            <div className="input-wrapper">
              <input
                type="text"
                placeholder="Search address or drag a pin..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

             <label className="field-label">Location</label>
             <div className="pin-controls">
               <button
                 type="button"
                 onClick={handleDropPin}
                 disabled={isDroppingPin}
                 className={`drop-pin-button ${isDroppingPin ? 'active' : ''}`}
               >
                 {isDroppingPin ? (
                   <>
                     <div className="spinner"></div>
                     Click on map...
                   </>
                 ) : (
                   '📍 Drop Pin'
                 )}
               </button>
               
               {(latitude && longitude) && (
                 <div className="selected-coordinates">
                   <div className="coordinate-display">
                     <span className="coord-label">Lat:</span>
                     <span className="coord-value">{latitude}</span>
                   </div>
                   <div className="coordinate-display">
                     <span className="coord-label">Lng:</span>
                     <span className="coord-value">{longitude}</span>
                   </div>
                   <button
                     type="button"
                     onClick={clearPin}
                     className="clear-pin-button"
                   >
                     ✕
                   </button>
                 </div>
               )}
             </div>

            <label className="field-label">Radius (m)</label>
            <div className="radius-control">
              <input
                type="range"
                min="50"
                max="1000"
                step="10"
                value={radius}
                onChange={(e) => setRadius(parseInt(e.target.value, 10))}
              />
              <span>{radius}</span>
            </div>

            <label className="field-label">Time window</label>
            <div className="time-window-inputs">
              <div className="time-input-field">
                <span>Days</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={timeWindowDays}
                  onChange={(e) => setTimeWindowDays(e.target.value)}
                />
              </div>
              <div className="time-input-field">
                <span>Hours</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  placeholder="0"
                  value={timeWindowHours}
                  onChange={(e) => setTimeWindowHours(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="analyze-button"
            >
              {analyzing ? (
                <>
                  <div className="spinner"></div>
                  Analyzing...
                </>
              ) : (
                'Analyze sound'
              )}
            </button>
          </div>

          <div className="sidebar-stats">
            <div>
              <span className="stats-label">Total Facilities</span>
              <span className="stats-value">{Object.values(stats).reduce((a, b) => a + b, 0)}</span>
            </div>
            <p>Data from OpenStreetMap via Overpass API</p>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="map-shell">
            <div ref={mapRef} className="map-instance" />
            <div className="map-grid-overlay"></div>
            <div className="map-radar map-radar--outer"></div>
            <div className="map-radar map-radar--middle"></div>
            <div className="map-radar map-radar--inner"></div>
            <div className="map-radar-dot"></div>

            <div className="map-layer-controls">
              <h3>Layer Controls</h3>
              {Object.keys(visibleLayers).map(category => (
                <div
                  key={category}
                  onClick={() => toggleLayer(category)}
                  className={`layer-item ${visibleLayers[category] ? 'active' : ''}`}
                  style={{ borderColor: visibleLayers[category] ? categoryColors[category] : '#e2e8f0' }}
                >
                  <div className="layer-label">
                    <div
                      className="layer-color"
                      style={{ background: categoryColors[category], opacity: visibleLayers[category] ? 1 : 0.3 }}
                    ></div>
                    <span>{categoryLabels[category]}</span>
                  </div>
                  <span
                    className="layer-count"
                    style={{ color: categoryColors[category], background: `${categoryColors[category]}20` }}
                  >
                    {stats[category] || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="report-card">
            <div>
              <h3>Report summary</h3>
              <p>
                Run the sound analysis to generate an overview of notable facilities within the selected
                radius and time window.
              </p>
            </div>
            <div className="report-actions">
              <button type="button" className="outline-button">Export PDF</button>
              <button type="button" className="primary-button">Save to Project</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacilitiesMap;