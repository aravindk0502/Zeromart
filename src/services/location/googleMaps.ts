const SCRIPT_ID = 'zeromart-google-maps-sdk';
let loaderPromise: Promise<any> | null = null;
let mapsReady = false;

export const GOOGLE_MAPS_LOADING_ERROR = 'Google Maps is still loading. Please try again.';
export const GOOGLE_MAPS_LOAD_ERROR = 'Google Maps failed to load. Please check API key and enabled APIs.';

const mapsNamespace = () => (window as any).google?.maps;

export const getGoogleMapsApiKey = () => String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

export const isGoogleMapsConfigured = () => {
  const key = getGoogleMapsApiKey();
  return Boolean(
    key
    && !key.includes('YOUR_')
    && !key.includes('PASTE_')
    && !key.includes('xxxxxxxx')
  );
};

export class GoogleMapsConfigurationError extends Error {
  code = 'GOOGLE_MAPS_NOT_CONFIGURED';
}

export const isGoogleMapsReady = () => Boolean(
  mapsReady
  && mapsNamespace()
  && typeof mapsNamespace().Geocoder === 'function'
);

export const loadGoogleMaps = async (): Promise<any> => {
  if (typeof window === 'undefined') throw new Error('Google Maps requires a browser environment.');
  if (mapsNamespace()) return mapsNamespace();
  if (!isGoogleMapsConfigured()) {
    throw new GoogleMapsConfigurationError(
      GOOGLE_MAPS_LOAD_ERROR
    );
  }
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const finish = () => {
      const maps = mapsNamespace();
      if (maps) resolve(maps);
      else {
        loaderPromise = null;
        reject(new Error(GOOGLE_MAPS_LOAD_ERROR));
      }
    };

    if (existing) {
      if (mapsNamespace()) {
        finish();
        return;
      }
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => {
        loaderPromise = null;
        reject(new Error(GOOGLE_MAPS_LOAD_ERROR));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(getGoogleMapsApiKey())}&libraries=places,geometry&loading=async&v=weekly`;
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => {
      loaderPromise = null;
      reject(new Error(GOOGLE_MAPS_LOAD_ERROR));
    }, { once: true });
    document.head.appendChild(script);
  });

  return loaderPromise;
};

export const importGoogleLibrary = async (library: string) => {
  const maps = await loadGoogleMaps();
  if (typeof maps.importLibrary === 'function') {
    try {
      await maps.importLibrary(library);
    } catch {
      throw new Error(GOOGLE_MAPS_LOAD_ERROR);
    }
  }
  const readyMaps = mapsNamespace();
  if (!readyMaps) throw new Error(GOOGLE_MAPS_LOADING_ERROR);
  return readyMaps;
};

export const prepareGoogleMaps = async () => {
  await importGoogleLibrary('places');
  await importGoogleLibrary('geocoding');
  const maps = mapsNamespace();
  mapsReady = Boolean(maps && typeof maps.Geocoder === 'function');
  if (!mapsReady) throw new Error(GOOGLE_MAPS_LOADING_ERROR);
  return maps;
};

export const createGoogleGeocoder = async () => {
  await prepareGoogleMaps();
  const maps = mapsNamespace();
  if (!maps || typeof maps.Geocoder !== 'function') throw new Error(GOOGLE_MAPS_LOADING_ERROR);
  return new (window as any).google.maps.Geocoder();
};

export const runGoogleGeocode = async (request: Record<string, unknown>) => {
  const geocoder = await createGoogleGeocoder();
  const maps = mapsNamespace();
  if (!maps) throw new Error(GOOGLE_MAPS_LOADING_ERROR);
  return new Promise<any[]>((resolve, reject) => {
    geocoder.geocode(request, (results: any[] | null, status: string) => {
      const okStatus = maps.GeocoderStatus?.OK || 'OK';
      if (status === okStatus && results?.length) {
        resolve(results);
        return;
      }
      if (status === (maps.GeocoderStatus?.ZERO_RESULTS || 'ZERO_RESULTS')) {
        resolve([]);
        return;
      }
      reject(new Error(status
        ? `Google Maps could not resolve this address (${status}).`
        : GOOGLE_MAPS_LOAD_ERROR));
    });
  });
};
