import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';

export function AuthPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpConfirm, setSignUpConfirm] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(signInEmail.trim(), signInPassword);
    setLoading(false);
    if (err) setError(err);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (signUpPassword !== signUpConfirm) {
      setError('Passwords do not match.');
      return;
    }
    if (signUpPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { error: err } = await signUp({
      email: signUpEmail.trim(),
      password: signUpPassword,
      fullName: signUpName.trim(),
    });
    setLoading(false);
    if (err) setError(err);
    else setSuccessMessage('Check your email to confirm your account.');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (!forgotEmail.trim()) {
      setError('Enter your email address.');
      return;
    }
    setLoading(true);
    const { error: err } = await resetPassword(forgotEmail.trim());
    setLoading(false);
    if (err) setError(err);
    else {
      setSuccessMessage('Check your email for the reset link.');
      setForgotPassword(false);
      setForgotEmail('');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #FAFAFA 0%, #F5F5F4 50%, #E2E8F0 100%)',
      }}
    >
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200/60 bg-white p-8 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
          <div className="text-center mb-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--app-primary)] text-white mb-3">
              <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>R</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--app-heading)]" style={{ fontFamily: 'var(--font-heading)' }}>
              ReconcileX
            </h1>
            <p className="text-sm text-[var(--app-body)] mt-1 font-body">
              AI-Powered Reconciliation Platform
            </p>
          </div>

          {forgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {successMessage && <p className="text-sm text-[var(--app-success)]">{successMessage}</p>}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setForgotPassword(false); setError(null); setSuccessMessage(null); }}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </Button>
              </div>
            </form>
          ) : (
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-6">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1.5"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      autoComplete="current-password"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      className="mt-1.5"
                      required
                    />
                  </div>
                  <button
                    type="button"
                    className="text-xs text-[var(--app-primary)] hover:underline"
                    onClick={() => setForgotPassword(true)}
                  >
                    Forgot password?
                  </button>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  {successMessage && <p className="text-sm text-[var(--app-success)]">{successMessage}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Signing in…' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="mt-6">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div>
                    <Label htmlFor="signup-name">Full name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      autoComplete="name"
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                      placeholder="Jane Doe"
                      className="mt-1.5"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1.5"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="mt-1.5"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="signup-confirm">Confirm password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={signUpConfirm}
                      onChange={(e) => setSignUpConfirm(e.target.value)}
                      placeholder="Repeat password"
                      className="mt-1.5"
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  {successMessage && <p className="text-sm text-[var(--app-success)]">{successMessage}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Creating account…' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
