import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { OtpVerification } from "@/components/auth/OtpVerification";
import { useLanguage } from "@/contexts/LanguageContext";
import logoKemika from "@/assets/logo-kemika.png";
import appIcon from "@/assets/app-icon.png";
const Login = () => {
  const navigate = useNavigate();
  const {
    user,
    signIn,
    isLoading: authLoading
  } = useAuth();
  const {
    toast
  } = useToast();
  const {
    t,
    language,
    setLanguage
  } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      navigate("/dashboard");
    }
  }, [user, authLoading, navigate]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: language === 'id' ? "Error" : "Error",
        description: language === 'id' ? "Email dan password harus diisi" : "Email and password are required",
        variant: "destructive"
      });
      return;
    }
    setIsLoading(true);
    const {
      error,
      requiresOtp
    } = await signIn(email, password);
    setIsLoading(false);
    if (error) {
      toast({
        title: language === 'id' ? "Login Gagal" : "Login Failed",
        description: getErrorMessage(error.message),
        variant: "destructive"
      });
      return;
    }
    if (requiresOtp) {
      setShowOtp(true);
      return;
    }
    toast({
      title: language === 'id' ? "Login Berhasil" : "Login Successful",
      description: language === 'id' ? "Selamat datang kembali!" : "Welcome back!"
    });
    navigate("/dashboard");
  };
  const getErrorMessage = (message: string): string => {
    if (message.includes("Invalid login credentials")) {
      return language === 'id' ? "Email atau password salah" : "Invalid email or password";
    }
    if (message.includes("Email not confirmed")) {
      return language === 'id' ? "Email belum dikonfirmasi. Periksa inbox Anda." : "Email not confirmed. Check your inbox.";
    }
    if (message.includes("Too many requests")) {
      return language === 'id' ? "Terlalu banyak percobaan. Coba lagi nanti." : "Too many attempts. Try again later.";
    }
    return message;
  };
  const handleOtpSuccess = () => {
    setShowOtp(false);
    toast({
      title: language === 'id' ? "Verifikasi Berhasil" : "Verification Successful",
      description: language === 'id' ? "Selamat datang, Super Admin!" : "Welcome, Super Admin!"
    });
    navigate("/dashboard");
  };
  const handleOtpCancel = () => {
    setShowOtp(false);
    setPassword("");
  };
  const toggleLanguage = () => {
    setLanguage(language === 'id' ? 'en' : 'id');
  };
  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>;
  }
  return <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-sidebar flex-col justify-between p-12 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-64 h-64 bg-accent rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
        </div>
        
        {/* Logo & Company */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-card/10 backdrop-blur-sm flex items-center justify-center">
              <img alt="App Icon" className="w-10 h-10 rounded-lg" src="/lovable-uploads/cb7d852a-00a6-461a-ad8f-806dbf150cf5.png" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-sidebar-foreground tracking-wide">PT KEMIKA KARYA PRATAMA</h1>
              <p className="text-sm text-sidebar-muted">Spreading Solution</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <h2 className="text-4xl font-bold text-sidebar-foreground leading-tight mb-6">
            Enterprise Expense<br />
            & Budget System
          </h2>
          <p className="text-lg text-sidebar-muted max-w-md leading-relaxed">
            {language === 'id' ? 'Kelola anggaran, pengajuan biaya, approval berjenjang, dan reimburse dengan mudah dalam satu platform terintegrasi.' : 'Manage budgets, expense requests, tiered approvals, and reimbursements easily in one integrated platform.'}
          </p>
        </div>

        {/* Stats */}
        <div className="relative z-10 flex gap-8 border-t border-sidebar-border pt-8">
          <div>
            <p className="text-3xl font-bold text-sidebar-foreground">7</p>
            <p className="text-sm text-sidebar-muted">{language === 'id' ? 'Divisi' : 'Divisions'}</p>
          </div>
          <div className="w-px bg-sidebar-border" />
          <div>
            <p className="text-3xl font-bold text-sidebar-foreground">100%</p>
            <p className="text-sm text-sidebar-muted">Paperless</p>
          </div>
          <div className="w-px bg-sidebar-border" />
          <div>
            <p className="text-3xl font-bold text-sidebar-foreground">Real-time</p>
            <p className="text-sm text-sidebar-muted">Tracking</p>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-12 bg-background relative">
        {/* Language Toggle */}
        <Button variant="ghost" size="sm" className="absolute top-4 right-4 gap-2" onClick={toggleLanguage}>
          <Globe className="h-4 w-4" />
          {language === 'id' ? 'EN' : 'ID'}
        </Button>

        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img src={logoKemika} alt="Kemika Logo" className="h-16" />
          </div>

          {/* Login Card */}
          <div className="bg-card rounded-2xl shadow-card p-8 animate-fade-in">
            {showOtp ? <OtpVerification onSuccess={handleOtpSuccess} onCancel={handleOtpCancel} /> : <>
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {language === 'id' ? 'Masuk ke Akun' : 'Sign In'}
                  </h2>
                  <p className="text-muted-foreground">
                    {language === 'id' ? 'Gunakan email dan password yang diberikan administrator' : 'Use the email and password provided by your administrator'}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('form.email')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input id="email" type="email" placeholder="nama@kemika.co.id" value={email} onChange={e => setEmail(e.target.value)} className="pl-10 h-12" required autoComplete="email" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t('form.password')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input id="password" type={showPassword ? "text" : "password"} placeholder={language === 'id' ? 'Masukkan password' : 'Enter password'} value={password} onChange={e => setPassword(e.target.value)} className="pl-10 pr-10 h-12" required autoComplete="current-password" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isLoading}>
                    {isLoading ? <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {language === 'id' ? 'Memproses...' : 'Processing...'}
                      </div> : language === 'id' ? 'Masuk' : 'Sign In'}
                  </Button>
                </form>

                <div className="mt-6 p-4 bg-secondary rounded-xl">
                  <p className="text-sm text-center text-secondary-foreground font-medium">
                    {language === 'id' ? 'Tidak memiliki akun?' : "Don't have an account?"}
                  </p>
                  <p className="text-sm text-center text-muted-foreground mt-1">
                    {language === 'id' ? 'Hubungi Super Admin untuk pembuatan akun baru' : 'Contact Super Admin for new account creation'}
                  </p>
                </div>
              </>}
          </div>

          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground mt-8">
            © 2026 PT. Kemika Karya Pratama. All rights reserved.
          </p>
        </div>
      </div>
    </div>;
};
export default Login;