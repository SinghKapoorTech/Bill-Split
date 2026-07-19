import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8">
        <h1 className="text-8xl font-extrabold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">404</h1>
        <p className="text-2xl text-foreground font-medium">Oops! Page not found</p>
        <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
        <div className="flex gap-4 justify-center mt-8">
          <a
            href="/"
            className="px-6 py-3 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground rounded-lg font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105"
          >
            Return to Home
          </a>
          <a
            href="/dashboard"
            className="px-6 py-3 border-2 border-border text-foreground rounded-lg font-semibold hover:border-primary hover:bg-muted transition-all duration-300"
          >
            Go to App
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
