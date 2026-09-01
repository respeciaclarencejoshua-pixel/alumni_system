import { useEffect, useRef, useState } from 'react';

const GENSAN_CENTER = { lat: 6.1164, lng: 125.1716 };
const GENSAN_BOUNDS = { north: 6.28, south: 5.85, east: 125.36, west: 124.94 };
let mapsPromise;

function loadGoogleMaps() {
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (mapsPromise) return mapsPromise;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('Google Maps API key is not configured.'));
  mapsPromise = new Promise((resolve, reject) => {
    const callback = `initNDDUMaps_${Date.now()}`;
    window[callback] = () => { delete window[callback]; resolve(window.google); };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly&callback=${callback}`;
    script.async = true;
    script.onerror = () => reject(new Error('Google Maps could not be loaded.'));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

function insideGenSan(position) {
  return position.lat >= GENSAN_BOUNDS.south && position.lat <= GENSAN_BOUNDS.north && position.lng >= GENSAN_BOUNDS.west && position.lng <= GENSAN_BOUNDS.east;
}

export default function GoogleMapsLocationPicker({ value, latitude, longitude, onChange }) {
  const searchRef = useRef(null), mapRef = useRef(null);
  const [status, setStatus] = useState('Loading map…');

  useEffect(() => {
    let active = true, marker;
    loadGoogleMaps().then((google) => {
      if (!active) return;
      const bounds = new google.maps.LatLngBounds(
        { lat: GENSAN_BOUNDS.south, lng: GENSAN_BOUNDS.west },
        { lat: GENSAN_BOUNDS.north, lng: GENSAN_BOUNDS.east },
      );
      const savedPosition = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
        ? { lat: Number(latitude), lng: Number(longitude) } : GENSAN_CENTER;
      const map = new google.maps.Map(mapRef.current, {
        center: savedPosition, zoom: latitude ? 16 : 13, restriction: { latLngBounds: bounds, strictBounds: true },
        streetViewControl: false, mapTypeControl: false, fullscreenControl: true,
      });
      marker = new google.maps.Marker({ map, position: latitude ? savedPosition : null, draggable: true, title: 'Event location' });
      const geocoder = new google.maps.Geocoder();
      const selectPosition = (position, address) => {
        const point = { lat: position.lat(), lng: position.lng() };
        if (!insideGenSan(point)) return setStatus('Choose a location within General Santos City.');
        marker.setPosition(point); map.panTo(point); setStatus('Event pin selected.');
        if (address) onChange({ location: address, latitude: point.lat, longitude: point.lng });
        else geocoder.geocode({ location: point }, (results, resultStatus) => onChange({ location: resultStatus === 'OK' ? results[0]?.formatted_address || value : value, latitude: point.lat, longitude: point.lng }));
      };
      const autocomplete = new google.maps.places.Autocomplete(searchRef.current, {
        bounds, strictBounds: true, componentRestrictions: { country: 'ph' }, fields: ['formatted_address', 'geometry', 'name'],
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) return setStatus('Select a result from the list.');
        selectPosition(place.geometry.location, place.formatted_address || place.name);
        map.setZoom(16);
      });
      map.addListener('click', (event) => selectPosition(event.latLng));
      marker.addListener('dragend', (event) => selectPosition(event.latLng));
      setStatus('Search or tap the map to place the event pin.');
    }).catch((error) => active && setStatus(error.message));
    return () => { active = false; if (marker) marker.setMap(null); };
  }, []);

  return <div className="maps-location-picker"><label>Search in General Santos City<input ref={searchRef} defaultValue={value} onChange={(event)=>onChange({ location:event.target.value, latitude:null, longitude:null })} placeholder="Search a venue, street, or landmark" autoComplete="off" required /></label><div ref={mapRef} className="maps-location-canvas"/><p>{status}</p>{value&&<div className="selected-map-address"><span aria-hidden="true">●</span><div><small>Selected location</small><strong>{value}</strong></div></div>}</div>;
}
