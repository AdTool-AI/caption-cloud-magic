import { isAwsTestBackend } from '@/lib/backendTarget';
import { tx } from "@/lib/i18nText";
import { useState, useEffect, useRef } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BlackTieFooter } from "@/components/landing/BlackTieFooter";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Loader2, Eye, EyeOff, Shield } from "lucide-react";
import { toast } from "sonner";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { TwoFactorChallenge } from "@/components/account/TwoFactorChallenge";
import { motion } from "framer-motion";
import { AuthStatusIndicator } from "@/components/system-status/AuthStatusIndicator";
import { SEO } from "@/components/SEO";
import { PasswordStrength, evaluatePassword, PASSWORD_MIN_LENGTH } from "@/components/auth/PasswordStrength";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

const Auth = () => {
  const { t } = useTranslation();
  const { user, session, signUp, signIn, loading: authLoading, requiresMfa, clearMfaRequirement, signOut } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const submitPending = useRef(false);
  const [loginError, setLoginError] = useState("");

  // Redirect if already logged in
  useEffect(() => {
    if (user && !isAwsTestBackend) {
      // Check if there's a pending composer import
      const composerImport = localStorage.getItem('composer_import');
      
      if (composerImport) {
        console.log('[Auth] Found composer import, redirecting to /composer');
        navigate('/composer');
      } else {
        navigate('/home');
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAwsTestBackend) {
      if (submitPending.current || requiresMfa) return;
      submitPending.current = true; setLoading(true); setLoginError("");
      try {
        const result = await signIn(email.trim(), password);
        if (result.error) setLoginError(tx({de:"Anmeldung fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.",en:"Sign-in failed. Please check your account details.",es:"No se pudo iniciar sesión. Comprueba tus datos."}));
      } catch {
        setLoginError(tx({de:"Anmeldung derzeit nicht möglich. Bitte versuche es erneut.",en:"Sign-in could not complete. Please try again.",es:"No se pudo completar el inicio de sesión. Inténtalo de nuevo."}));
      } finally {
        setPassword(""); setLoading(false); submitPending.current = false;
      }
      return;
    }
    
    if (!email || !password) {
      toast.error(tx({ de: "Bitte fülle alle Felder aus", en: "Please fill in all fields", es: "Rellena todos los campos" }));
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      toast.error(tx({ de: "Passwörter stimmen nicht überein", en: "Passwords don't match", es: "Las contraseñas no coinciden" }));
      return;
    }

    if (!isLogin && !evaluatePassword(password).valid) {
      toast.error(tx({
        de: `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen haben und eine Zahl oder ein Sonderzeichen enthalten`,
        en: `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include a number or symbol`,
        es: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres e incluir un número o símbolo`,
      }));
      return;
    }



    setLoading(true);

    if (isLogin) {
      const result = await signIn(email, password);
      // Unverified account: send the user where they can resend the mail
      const msg = (result?.error as { message?: string } | undefined)?.message?.toLowerCase() ?? "";
      if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
        navigate(`/auth/check-email?email=${encodeURIComponent(email)}`);
      }

    } else {
      const result = await signUp(email, password);
      
      // Track signup completion
      if (result) {
        trackEvent(ANALYTICS_EVENTS.SIGNUP_COMPLETED, {
          plan: 'free',
          method: 'email'
        });
      }

      // Navigate to dedicated check-email page on successful signup
      if (!result?.error) {
        navigate(`/auth/check-email?email=${encodeURIComponent(email)}`);
      }
    }

    setLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && !requiresMfa && (!isAwsTestBackend || session?.user.id === user.id)) {
    const composerImport = localStorage.getItem('composer_import');
    const redirectTo = isAwsTestBackend ? '/home' : composerImport ? '/composer' : '/ai-text-studio';
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <SEO
        title={isAwsTestBackend ? "Sign In" : "Sign In or Create Account"}
        description={isAwsTestBackend ? "Sign in to your AdTool AI account." : "Sign in to AdTool AI or create a free account to generate AI-powered social media captions, schedule posts, and grow your audience across every platform."}
        canonical="/auth"
        noindex
      />
      {/* Premium Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,hsl(var(--accent)/0.05),transparent_50%)]" />
      
      {/* Subtle Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
                          linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
        backgroundSize: '60px 60px'
      }} />

      <main className="flex-1 flex items-center justify-center py-12 px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Card className="backdrop-blur-xl bg-card/80 border border-border/50 shadow-[0_20px_60px_-15px_hsl(var(--primary)/0.15)] hover:shadow-[0_25px_70px_-15px_hsl(var(--primary)/0.2)] transition-all duration-500">
            <CardHeader className="text-center space-y-4 pb-6">
              {/* Animated Icon */}
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="relative w-16 h-16 mx-auto"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent rounded-2xl animate-pulse opacity-20" />
                <div className="relative w-full h-full bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center shadow-[0_8px_30px_-5px_hsl(var(--primary)/0.4)]">
                  <Sparkles className="h-8 w-8 text-primary-foreground" />
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="space-y-2"
              >
                <CardTitle className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text">
                  {isLogin ? t('auth_login_title') : t('auth_signup_title')}
                </CardTitle>
                <CardDescription className="text-base text-muted-foreground">
                  {isLogin ? t('auth_welcome_back') : t('auth_welcome_new')}
                </CardDescription>
                <p className="text-sm text-muted-foreground/80">
                  {isLogin ? t('auth_login_description') : t('auth_signup_description')}
                </p>
              </motion.div>
            </CardHeader>
            
            {isAwsTestBackend && requiresMfa ? <CardContent className="space-y-5">
              <p role="alert">{tx({de:"Für dieses Konto ist eine zusätzliche Verifizierung erforderlich. Die Anmeldung kann hier noch nicht abgeschlossen werden.",en:"This account requires additional verification. Sign-in cannot be completed here yet.",es:"Esta cuenta requiere verificación adicional. El inicio de sesión aún no se puede completar aquí."})}</p>
              <Button className="w-full" variant="outline" onClick={()=>void signOut()}>{tx({de:"Abmelden",en:"Sign out",es:"Cerrar sesión"})}</Button>
            </CardContent> : <form onSubmit={handleSubmit}>

              <CardContent className="space-y-5">
                {/* Google one-click */}
                {!isAwsTestBackend && <div className="space-y-4">
                  <GoogleSignInButton disabled={loading} />
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border/60" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {tx({ de: "oder mit E-Mail", en: "or with email", es: "o con correo" })}
                    </span>
                    <span className="h-px flex-1 bg-border/60" />
                  </div>
                </div>}

                {/* Email Field */}
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4, duration: 0.3 }}
                  className="space-y-2"
                >
                  <Label htmlFor="email" className="text-sm font-medium">
                    {t('auth_email')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="email"
                    inputMode="email"
                    name="email"
                    className="h-11 rounded-xl bg-muted/30 border-border/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all duration-300"
                  />
                </motion.div>

                {/* Password Field with Toggle */}
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5, duration: 0.3 }}
                  className="space-y-2"
                >
                  <Label htmlFor="password" className="text-sm font-medium">
                    {t('auth_password')}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={(e) => setCapsLockOn(e.getModifierState?.("CapsLock") ?? false)}
                      onKeyDown={(e) => setCapsLockOn(e.getModifierState?.("CapsLock") ?? false)}
                      onBlur={() => setCapsLockOn(false)}
                      required
                      disabled={loading}
                      name="password"
                      minLength={isLogin ? undefined : PASSWORD_MIN_LENGTH}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      className="h-11 rounded-xl bg-muted/30 border-border/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 pr-10 transition-all duration-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      disabled={loading}
                      aria-label={showPassword ? t('auth_hide_password') : t('auth_show_password')}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {capsLockOn && (
                    <p className="text-xs text-warning" aria-live="polite">
                      {tx({
                        de: "Feststelltaste ist aktiv",
                        en: "Caps Lock is on",
                        es: "Bloq Mayús está activado",
                      })}
                    </p>
                  )}
                  {!isLogin && <PasswordStrength password={password} />}
                </motion.div>


                {/* Confirm Password for Signup */}
                {!isLogin && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="confirm-password" className="text-sm font-medium">
                      {t('auth_password_confirm')}
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        disabled={loading}
                        minLength={6}
                        className="h-11 rounded-xl bg-muted/30 border-border/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 pr-10 transition-all duration-300"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        disabled={loading}
                        aria-label={showConfirmPassword ? t('auth_hide_password') : t('auth_show_password')}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Remember Me & Forgot Password (Login only) */}
                {isLogin && !isAwsTestBackend && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.3 }}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                        disabled={loading}
                        className="border-border/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <Label
                        htmlFor="remember"
                        className="text-sm font-normal cursor-pointer select-none text-muted-foreground"
                      >
                        {t('auth_remember_me')}
                      </Label>
                    </div>
                    <a
                      href="/forgot-password"
                      className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      {t('auth_forgot_password')}
                    </a>
                  </motion.div>
                )}

                {isAwsTestBackend && <Link to="/forgot-password" className="block text-right text-sm font-medium text-primary underline">{tx({de:'Passwort vergessen?',en:'Forgot password?',es:'¿Olvidaste tu contraseña?'})}</Link>}

                {/* Submit Button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7, duration: 0.3 }}
                >
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-[0_8px_30px_-5px_hsl(var(--primary)/0.3)] hover:shadow-[0_12px_40px_-5px_hsl(var(--primary)/0.4)] transition-all duration-300 group relative overflow-hidden" 
                    size="lg" 
                    disabled={loading}
                  >
                    {/* Shimmer Effect */}
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                    <span className="relative flex items-center gap-2">
                      {isLogin ? t('btn_login') : t('btn_signup')}
                    </span>
                  </Button>
                </motion.div>

                {/* 2FA Info Badge */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8, duration: 0.3 }}
                  className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70"
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>{isAwsTestBackend ? tx({de:"Sichere Anmeldung",en:"Secure sign-in",es:"Inicio de sesión seguro"}) : tx({ de: "Geschützt durch 2-Faktor-Authentifizierung", en: "Protected by two-factor authentication", es: "Protegido por autenticación de dos factores" })}</span>
                </motion.div>

                {loginError && <p role="alert" className="text-sm text-destructive">{loginError}</p>}
                {isAwsTestBackend && <p className="text-center text-xs text-muted-foreground">{tx({de:"Melde dich mit deinem bestehenden AdTool-Konto an.",en:"Sign in with your existing AdTool account.",es:"Inicia sesión con tu cuenta existente de AdTool."})}</p>}
                {/* Toggle Login/Signup */}
                {!isAwsTestBackend && <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9, duration: 0.3 }}
                  className="text-center pt-2"
                >
                  <p className="text-sm text-muted-foreground">
                    {isLogin ? t('auth_no_account') : t('auth_have_account')}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsLogin(!isLogin);
                        setShowPassword(false);
                        setShowConfirmPassword(false);
                      }}
                      className="text-primary hover:text-primary/80 font-semibold transition-colors"
                      disabled={loading}
                    >
                      {isLogin ? t('btn_signup') : t('btn_login')}
                    </button>
                  </p>
                </motion.div>}
              </CardContent>
            </form>}
          </Card>
        </motion.div>
      </main>

      {/* 2FA Challenge Modal */}
      {!isAwsTestBackend && <TwoFactorChallenge
        open={requiresMfa}
        onSuccess={() => {
          clearMfaRequirement();
          navigate('/home');
        }}
        onCancel={() => {
          clearMfaRequirement();
        }}
      />}

      <BlackTieFooter />
      {!isAwsTestBackend && <AuthStatusIndicator />}
    </div>
  );
};

export default Auth;
