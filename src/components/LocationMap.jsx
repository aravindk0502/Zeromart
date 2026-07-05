import { ExternalLink, Loader2, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { directionsUrl } from '../services/location/distance';
import { isGoogleMapsConfigured, loadGoogleMaps } from '../services/location/googleMaps';

export default function LocationMap({
  lat,
  lng,
  latitude,
  longitude,
  title = 'Selected location',
  height = 200,
  interactive = false,
  zoom = 17,
  onLocationChange,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const dragListenerRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const resolvedLat = Number(latitude ?? lat);
  const resolvedLng = Number(longitude ?? lng);
  const validCoordinates = Number.isFinite(resolvedLat) && Number.isFinite(resolvedLng);

  useEffect(() => {
    if (!validCoordinates || !containerRef.current || !isGoogleMapsConfigured()) {
      setStatus(isGoogleMapsConfigured() ? 'unavailable' : 'fallback');
      return undefined;
    }
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      const position = { lat: resolvedLat, lng: resolvedLng };
      if (!mapRef.current) {
        mapRef.current = new maps.Map(containerRef.current, {
          center: position,
          zoom,
          disableDefaultUI: !interactive,
          zoomControl: interactive,
          streetViewControl: false,
          fullscreenControl: interactive,
          mapTypeControl: false,
          gestureHandling: interactive ? 'greedy' : 'none',
          clickableIcons: false,
        });
        markerRef.current = new maps.Marker({
          map: mapRef.current,
          position,
          title,
          draggable: Boolean(interactive && onLocationChange),
          animation: maps.Animation.DROP,
        });
      } else {
        mapRef.current.setCenter(position);
        mapRef.current.setZoom(zoom);
        markerRef.current?.setPosition(position);
        markerRef.current?.setTitle(title);
        markerRef.current?.setDraggable(Boolean(interactive && onLocationChange));
      }
      dragListenerRef.current?.remove?.();
      if (interactive && onLocationChange && markerRef.current) {
        dragListenerRef.current = markerRef.current.addListener('dragend', (event) => {
          const nextLatitude = Number(event.latLng?.lat());
          const nextLongitude = Number(event.latLng?.lng());
          if (Number.isFinite(nextLatitude) && Number.isFinite(nextLongitude)) {
            onLocationChange({ latitude: nextLatitude, longitude: nextLongitude });
          }
        });
      }
      setStatus('ready');
    }).catch(() => setStatus('fallback'));
    return () => {
      cancelled = true;
      dragListenerRef.current?.remove?.();
    };
  }, [interactive, onLocationChange, resolvedLat, resolvedLng, title, validCoordinates, zoom]);

  if (!validCoordinates) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" aria-label={`Map showing ${title}`} />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-emerald-50 text-emerald-700">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}
      {status === 'fallback' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-emerald-50 to-white p-5 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-white"><MapPin size={22} /></span>
          <div>
            <p className="font-bold text-slate-900">{title}</p>
            <p className="mt-1 text-xs text-slate-500">{resolvedLat.toFixed(6)}, {resolvedLng.toFixed(6)}</p>
          </div>
          <a href={directionsUrl({ latitude: resolvedLat, longitude: resolvedLng })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white">
            Open map <ExternalLink size={13} />
          </a>
        </div>
      )}
    </div>
  );
}
