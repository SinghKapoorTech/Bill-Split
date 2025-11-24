import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-slate-50">
      <div className="text-center space-y-6 p-8">
        <h1 className="text-8xl font-extrabold bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">404</h1>
        <p className="text-2xl text-slate-600 font-medium">Oops! Page not found</p>
        <p className="text-slate-500">The page you're looking for doesn't exist.</p>
        <div className="flex gap-4 justify-center mt-8">
          <a 
            href="/" 
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105"
          >
            Return to Home
          </a>
          <a 
            href="/scan" 
            className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-lg font-semibold hover:border-cyan-500 hover:bg-slate-50 transition-all duration-300"
          >
            Go to App
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
