import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ChefHat, ArrowLeft, Mail, Lock } from "lucide-react";
import { getAdminAccess } from "@/lib/adminAuth";
import { motion } from "framer-motion";

const AuthWrapper = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/5">
    {/* Decorative blobs */}
    <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
    <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-secondary/8 rounded-full blur-3xl" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/3 rounded-full blur-3xl" />
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
      className="relative z-10 w-full max-w-md"
    >
      {children}
    </motion.div>
  </div>
);

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) throw error;
      const adminAccess = await getAdminAccess(data.user.id);
      if (!adminAccess.hasAccess) {
        await supabase.auth.signOut();
        toast.error("Access denied. Admin privileges required.");
        return;
      }
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to login");
      if (message.toLowerCase().includes("invalid login credentials")) {
        toast.error("Invalid email or password. If you just signed up, verify your email first.");
        return;
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail) { toast.error("Please enter your email address"); return; }
    const normalizedResetEmail = resetEmail.trim().toLowerCase();
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedResetEmail, {
        redirectTo: `${window.location.origin}/login?reset=true`,
      });
      if (error) throw error;
      toast.success("Password reset email sent! Check your inbox.");
      setShowForgotPassword(false);
      setResetEmail("");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to send reset email"));
    } finally {
      setResetLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <AuthWrapper>
        <Card className="border-border/50 shadow-elevated backdrop-blur-sm bg-card/90">
          <CardHeader className="space-y-4 text-center pb-2">
            <div className="mx-auto w-14 h-14 bg-gradient-to-br from-primary to-teal-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <ChefHat className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-heading">Reset Password</CardTitle>
              <CardDescription className="mt-1.5">Enter your email to receive a reset link</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resetEmail" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="resetEmail" type="email" placeholder="admin@ozkitchen.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required disabled={resetLoading} className="pl-10 h-11 rounded-xl" />
                </div>
              </div>
              <Button type="submit" className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-teal-700 hover:from-primary/90 hover:to-teal-700/90 shadow-lg shadow-primary/20" disabled={resetLoading}>
                {resetLoading ? "Sending..." : "Send Reset Link"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowForgotPassword(false)}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </AuthWrapper>
    );
  }

  return (
    <AuthWrapper>
      <Card className="border-border/50 shadow-elevated backdrop-blur-sm bg-card/90">
        <CardHeader className="space-y-4 text-center pb-2">
          <div className="mx-auto w-14 h-14 bg-gradient-to-br from-primary to-teal-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
            <ChefHat className="w-7 h-7 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-heading">Welcome Back</CardTitle>
            <CardDescription className="mt-1.5">Sign in to OZ Kitchen Admin</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="admin@ozkitchen.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} className="pl-10 h-11 rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <button type="button" onClick={() => setShowForgotPassword(true)} className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="password" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} className="pl-10 h-11 rounded-xl" />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-teal-700 hover:from-primary/90 hover:to-teal-700/90 shadow-lg shadow-primary/20" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <div className="text-center text-sm text-muted-foreground pt-2">
              Don't have an account?{" "}
              <Link to="/signup" className="text-primary hover:text-primary/80 font-semibold transition-colors">
                Sign up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthWrapper>
  );
};

export default Login;
