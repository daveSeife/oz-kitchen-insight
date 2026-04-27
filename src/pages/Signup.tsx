import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ChefHat, Mail, Lock, User } from "lucide-react";
import { motion } from "framer-motion";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const redirectUrl = `${window.location.origin}/login`;
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail, password,
        options: { emailRedirectTo: redirectUrl, data: { first_name: firstName, last_name: lastName } }
      });
      if (error) throw error;
      toast.success("Account created! Please check your email to verify your account.");
      setTimeout(() => navigate("/login"), 2000);
    } catch (error: any) {
      toast.error(error.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-secondary/8 rounded-full blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="border-border/50 shadow-elevated backdrop-blur-sm bg-card/90">
          <CardHeader className="space-y-4 text-center pb-2">
            <div className="mx-auto w-14 h-14 bg-gradient-to-br from-primary to-teal-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <ChefHat className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-heading">Create Account</CardTitle>
              <CardDescription className="mt-1.5">
                Sign up for OZ Kitchen. Contact a super admin to grant access.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-sm font-medium">First Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="firstName" type="text" placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} required disabled={loading} className="pl-10 h-11 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-sm font-medium">Last Name</Label>
                  <Input id="lastName" type="text" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} required disabled={loading} className="h-11 rounded-xl" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="admin@ozkitchen.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} className="pl-10 h-11 rounded-xl" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} className="pl-10 h-11 rounded-xl" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={loading} className="pl-10 h-11 rounded-xl" />
                </div>
              </div>
              <Button type="submit" className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-teal-700 hover:from-primary/90 hover:to-teal-700/90 shadow-lg shadow-primary/20" disabled={loading}>
                {loading ? "Creating Account..." : "Sign Up"}
              </Button>
              <div className="text-center text-sm text-muted-foreground pt-2">
                Already have an account?{" "}
                <Link to="/login" className="text-primary hover:text-primary/80 font-semibold transition-colors">Sign in</Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Signup;
