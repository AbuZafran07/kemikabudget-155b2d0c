import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileQuestion, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <FileQuestion className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Halaman Tidak Ditemukan
        </h2>
        <p className="text-muted-foreground mb-8">
          Maaf, halaman yang Anda cari tidak ada atau telah dipindahkan.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <Link to="/dashboard" className="gap-2">
              <Home className="h-4 w-4" />
              Ke Dashboard
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Halaman Login</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
