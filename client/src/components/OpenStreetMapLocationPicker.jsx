import { useEffect, useRef, useState } from 'react';

const CENTER = [6.1164, 125.1716];
const BOUNDS = [[5.85, 124.94], [6.28, 125.36]];
const VIEWBOX = '124.94,6.28,125.36,5.85';
let leafletPromise, lastRequest = 0;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; script.crossOrigin = '';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('The OpenStreetMap viewer could not be loaded.'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

const inside = (lat, lon) => lat >= 5.85 && lat <= 6.28 && lon >= 124.94 && lon <= 125.36;
async function nominatim(url) {
  const wait = Math.max(0, 1100 - (Date.now() - lastRequest));
  if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
  lastRequest = Date.now();
  const response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!response.ok) throw new Error('Location search is temporarily unavailable.');
  return response.json();
}

export default function OpenStreetMapLocationPicker({ value, latitude, longitude, onChange }) {
  const node = useRef(null), mapRef = useRef(null), markerRef = useRef(null);
  const [query, setQuery] = useState(value || ''), [results, setResults] = useState([]);
  const [status, setStatus] = useState('Loading map…'), [searching, setSearching] = useState(false);

  function choose(lat, lon, address) {
    if (!inside(lat, lon)) return setStatus('Choose a location within General Santos City.');
    markerRef.current?.setLatLng([lat, lon]).setOpacity(1); mapRef.current?.setView([lat, lon], 16);
    setQuery(address); onChange({ location: address, latitude: lat, longitude: lon }); setStatus('Event pin selected.');
  }
  async function reverse(lat, lon) {
    if (!inside(lat, lon)) return setStatus('Choose a location within General Santos City.');
    markerRef.current?.setLatLng([lat, lon]).setOpacity(1);
    mapRef.current?.panTo([lat, lon]);
    setStatus('Finding the address…');
    try { const data = await nominatim(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18`); choose(lat, lon, data.display_name || `${lat.toFixed(6)}, ${lon.toFixed(6)}`); }
    catch (error) { onChange({ location: `${lat.toFixed(6)}, ${lon.toFixed(6)}, General Santos City`, latitude: lat, longitude: lon }); setStatus(`${error.message} The pin coordinates were saved.`); }
  }
  async function search(event) {
    event.preventDefault(); if (!query.trim()) return;
    setSearching(true); setResults([]); setStatus('Searching General Santos City…');
    try {
      const data = await nominatim(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&bounded=1&viewbox=${VIEWBOX}&countrycodes=ph&q=${encodeURIComponent(`${query}, General Santos City`)}`);
      const valid = data.filter((item) => inside(Number(item.lat), Number(item.lon)));
      setResults(valid); setStatus(valid.length ? 'Select a result, or tap the map.' : 'No result found in General Santos City.');
    } catch (error) { setStatus(error.message); } finally { setSearching(false); }
  }

  useEffect(() => {
    let active = true;
    loadLeaflet().then((L) => {
      if (!active || !node.current) return;
      const savedLat = Number(latitude), savedLon = Number(longitude);
      const saved = latitude !== null && latitude !== undefined && latitude !== ''
        && longitude !== null && longitude !== undefined && longitude !== ''
        && Number.isFinite(savedLat) && Number.isFinite(savedLon) && inside(savedLat, savedLon);
      const center = saved ? [savedLat, savedLon] : CENTER;
      const map = L.map(node.current, { maxBounds: BOUNDS, maxBoundsViscosity: 1, minZoom: 11 }).setView(center, saved ? 16 : 13);
      let fallbackLoaded = false;
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      tiles.on('tileerror', () => {
        if (fallbackLoaded) return;
        fallbackLoaded = true; map.removeLayer(tiles);
        L.tileLayer('https://tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors, Tiles style by HOT' }).addTo(map);
      });
      const pinIcon = L.divIcon({ className:'nddu-map-pin-wrap', html:'<span class="nddu-map-pin"></span>', iconSize:[30,42], iconAnchor:[15,42] });
      const marker = L.marker(center, { draggable: true, opacity: 1, icon:pinIcon }).addTo(map);
      marker.on('dragend', () => { const point = marker.getLatLng(); reverse(point.lat, point.lng); });
      map.on('click', (event) => reverse(event.latlng.lat, event.latlng.lng));
      mapRef.current = map; markerRef.current = marker; setStatus(saved ? 'Drag the pin or tap the map to update the address.' : 'General Santos City is selected. Drag the pin or tap the map to choose the exact address.');
      window.setTimeout(() => map.invalidateSize(), 0);
    }).catch((error) => active && setStatus(error.message));
    return () => { active = false; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  return <div className="maps-location-picker"><form className="osm-location-search" onSubmit={search}><label htmlFor="event-location-search">Search within General Santos City</label><div><input id="event-location-search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Venue, street, or landmark" autoComplete="off"/><button disabled={searching}>{searching?'Searching…':'Search'}</button></div></form>{results.length>0&&<ul className="osm-search-results">{results.map((result)=><li key={result.place_id}><button type="button" onClick={()=>{choose(Number(result.lat),Number(result.lon),result.display_name);setResults([]);}}>{result.display_name}</button></li>)}</ul>}<div ref={node} className="maps-location-canvas"/><p>{status}</p>{value&&<div className="selected-map-address"><span aria-hidden="true">●</span><div><small>Selected location</small><strong>{value}</strong></div></div>}</div>;
}
