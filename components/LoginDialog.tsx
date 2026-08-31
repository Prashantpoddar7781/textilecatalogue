import React, { useState } from 'react';
import { X, Mail, Lock, User, LogIn, KeyRound } from 'lucide-react';
import { authApi } from '../services/api';

interface Props {
  onClose: () => void;
  onSuccess: (token: string, user: any) => void;
}

type AuthMode = 'login' | 'signup' | 'otp-login' | 'forgot' | 'reset';

export const LoginDialog: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    newPassword: '',
    name: '',
    firmName: '',
    otp: ''
  });

  const title = authMode === 'signup'
    ? 'Create Account'
    : authMode === 'otp-login'
      ? 'Login with OTP'
      : authMode === 'forgot' || authMode === 'reset'
        ? 'Reset Password'
        : 'Login';

  const normalizedEmail = () => formData.email.trim().toLowerCase();

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const email = normalizedEmail();
      if (authMode === 'login') {
        const { token, user } = await authApi.login(email, formData.password);
        localStorage.setItem('auth_token', token);
        onSuccess(token, user);
        onClose();
      } else if (authMode === 'signup') {
        const { token, user } = await authApi.register(
          email,
          formData.password,
          formData.name,
          formData.firmName
        );
        localStorage.setItem('auth_token', token);
        onSuccess(token, user);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const purpose = authMode === 'forgot' ? 'reset' : 'login';
      await authApi.requestOtp(normalizedEmail(), purpose);
      setNotice('OTP sent to your email. Check Inbox and Spam/Promotions.');
    } catch (err: any) {
      setError(err.message || 'Could not send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const purpose = authMode === 'forgot' ? 'reset' : 'login';
      const result = await authApi.verifyOtp(normalizedEmail(), purpose, formData.otp.trim());
      if (purpose === 'reset') {
        if (!result.resetToken) throw new Error('Reset token missing');
        setResetToken(result.resetToken);
        setAuthMode('reset');
        setNotice('OTP verified. Enter a new password.');
      } else {
        if (!result.token || !result.user) throw new Error('Login response missing');
        localStorage.setItem('auth_token', result.token);
        onSuccess(result.token, result.user);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      await authApi.resetPassword(resetToken, formData.newPassword);
      setNotice('Password updated. Please login with your new password.');
      setAuthMode('login');
      setFormData(prev => ({ ...prev, password: '', newPassword: '', otp: '' }));
    } catch (err: any) {
      setError(err.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseOrBackToLogin = () => {
    if (authMode === 'login') {
      onClose();
      return;
    }
    setAuthMode('login');
    setError('');
    setNotice('');
    setResetToken('');
    setFormData(prev => ({ ...prev, otp: '', newPassword: '' }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {title}
          </h2>
          <button onClick={handleCloseOrBackToLogin} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={authMode === 'reset' ? handleResetPassword : authMode === 'otp-login' || authMode === 'forgot' ? handleRequestOtp : handlePasswordSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}
          {notice && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
              {notice}
            </div>
          )}

          {authMode === 'signup' && (
            <>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Your name"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Firm Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Your firm/business name"
                    value={formData.firmName}
                    onChange={e => setFormData({...formData, firmName: e.target.value})}
                  />
                </div>
              </div>
            </>
          )}

          {(authMode === 'login' || authMode === 'signup' || authMode === 'otp-login' || authMode === 'forgot') && (
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  required
                  type="email"
                  className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="your@email.com"
                  value={formData.email}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  onChange={e => setFormData({ ...formData, email: e.target.value.replace(/\s+/g, '') })}
                />
              </div>
            </div>
          )}

          {(authMode === 'login' || authMode === 'signup') && (
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  required
                  type="password"
                  minLength={6}
                  className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
            </div>
          )}

          {(authMode === 'otp-login' || authMode === 'forgot') && (
            <>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">OTP</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Enter OTP"
                      value={formData.otp}
                      onChange={e => setFormData({...formData, otp: e.target.value})}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={loading || !formData.email || !formData.otp}
                    onClick={() => void handleVerifyOtp()}
                    className="px-4 py-3 rounded-xl bg-gray-900 text-white font-semibold disabled:opacity-50"
                  >
                    Verify
                  </button>
                </div>
              </div>
            </>
          )}

          {authMode === 'reset' && (
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  required
                  type="password"
                  minLength={6}
                  className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="New password"
                  value={formData.newPassword}
                  onChange={e => setFormData({...formData, newPassword: e.target.value})}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              'Please wait...'
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                {authMode === 'signup'
                  ? 'Create Account'
                  : authMode === 'otp-login' || authMode === 'forgot'
                    ? 'Send OTP'
                    : authMode === 'reset'
                      ? 'Update Password'
                      : 'Login'}
              </>
            )}
          </button>

          <div className="space-y-2 text-center">
            {authMode === 'login' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('otp-login');
                    setError('');
                    setNotice('');
                  }}
                  className="w-full text-sm text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  Login with OTP
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('forgot');
                    setError('');
                    setNotice('');
                  }}
                  className="w-full text-sm text-gray-600 hover:text-indigo-600 transition-colors"
                >
                  Forgot password?
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'signup' ? 'login' : 'signup');
                setError('');
                setNotice('');
              }}
              className="w-full text-sm text-gray-600 hover:text-indigo-600 transition-colors"
            >
              {authMode === 'signup' ? 'Already have an account? Login' : "Don't have an account? Sign up"}
            </button>
            {authMode !== 'login' && authMode !== 'signup' && (
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setNotice('');
                }}
                className="w-full text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                Back to password login
              </button>
            )}
          </div>
        </form>
        <p className="mt-4 text-center">
          <a href="/contact-us.html" className="text-xs font-semibold text-gray-500 hover:text-indigo-600">
            Need help? Contact us
          </a>
        </p>
      </div>
    </div>
  );
};

