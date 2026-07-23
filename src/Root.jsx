import { useEffect, useState } from 'react';
import App from './App';
import BusinessPortal from './pages/BusinessPortal';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import StaticContentRouter from './pages/StaticContentRouter';
import LocationPermissionScreen from './components/LocationPermissionScreen';
import LocationPicker from './components/LocationPicker';
import { useLocationEngine } from './hooks/useLocationEngine';

const STATIC_ROUTES = new Set(['/about', '/help', '/terms', '/contact', '/blog']);

export default function Root() {
  const [path, setPath] = useState(() => window.location.pathname);
  const locationEngine = useLocationEngine();

  useEffect(() => {
    const handleRoute = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handleRoute);
    return () => window.removeEventListener('popstate', handleRoute);
  }, []);

  const navigate = (nextPath) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const normalizedPath = String(path || '/').replace(/\/$/, '') || '/';
  const isStaticRoute = STATIC_ROUTES.has(normalizedPath) || normalizedPath.startsWith('/blog/');

  return (
    <>
      {path.startsWith('/business')
        ? <BusinessPortal path={path} navigate={navigate} />
        : normalizedPath === '/admin/login'
          ? <AdminLoginPage navigate={navigate} />
        : normalizedPath.startsWith('/admin')
          ? <AdminDashboardPage navigate={navigate} />
        : isStaticRoute
          ? <StaticContentRouter path={path} navigate={navigate} />
          : <App path={path} navigate={navigate} />}
      <LocationPermissionScreen />
      <LocationPicker
        open={locationEngine.pickerOpen}
        onClose={locationEngine.closePicker}
        {...locationEngine.pickerOptions}
      />
    </>
  );
}
