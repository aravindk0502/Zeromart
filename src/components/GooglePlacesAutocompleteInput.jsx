import { Loader2, MapPin, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocationEngine } from '../hooks/useLocationEngine';

export default function GooglePlacesAutocompleteInput({
  onSelect,
  placeholder = 'Search door no, street, building, landmark, area',
}) {
  const engine = useLocationEngine();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setSuggestions([]);
      setError('');
      return undefined;
    }
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const results = await engine.searchLocations(value, engine.location);
        if (currentRequest === requestId.current) setSuggestions(results);
      } catch (searchError) {
        if (currentRequest === requestId.current) {
          setSuggestions([]);
          setError(searchError?.message || 'Google address suggestions are temporarily unavailable.');
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [engine.location?.latitude, engine.location?.longitude, query]);

  const chooseSuggestion = async (suggestion) => {
    setLoading(true);
    setError('');
    try {
      const location = suggestion.location || await engine.resolveSuggestion(suggestion);
      onSelect?.(location);
      setQuery(suggestion.description || location.formattedAddress);
      setSuggestions([]);
    } catch (selectionError) {
      setError(selectionError?.message || 'This address could not be resolved.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-50">
        <Search size={18} className="shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-3.5 text-sm font-semibold text-slate-800 outline-none"
        />
        {loading ? <Loader2 size={17} className="animate-spin text-emerald-700" /> : query && (
          <button type="button" onClick={() => { setQuery(''); setSuggestions([]); }} className="text-slate-400" aria-label="Clear address search"><X size={17} /></button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-[calc(100%+0.4rem)] z-40 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
          {suggestions.map((suggestion) => (
            <button key={suggestion.id} type="button" onClick={() => chooseSuggestion(suggestion)} className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-emerald-50">
              <MapPin size={16} className="mt-0.5 shrink-0 text-emerald-700" />
              <span className="min-w-0">
                <strong className="block truncate text-sm text-slate-900">{suggestion.primaryText}</strong>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{suggestion.secondaryText}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">{error}</p>}
    </div>
  );
}
