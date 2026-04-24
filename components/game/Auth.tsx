'use client';

import React, { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { useGameStore } from '@/lib/store';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, UserPlus, LogOut, ShieldCheck, User, Lock, ShieldAlert } from 'lucide-react';

export const Auth: React.FC<{ isLanding?: boolean }> = ({ isLanding }) => {
  const { user, setUser, loadGame, saveGame } = useGameStore();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>(isLanding ? 'login' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper to convert username to internal email
  const toEmail = (name: string) => `${name.toLowerCase().trim()}@aetheria.game`;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({ uid: firebaseUser.uid, email: firebaseUser.email || '' });
        loadGame(firebaseUser.uid);
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, [setUser, loadGame]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = toEmail(username);

    try {
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        setUser({ uid: cred.user.uid, email: cred.user.email || '' });
        await saveGame();
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        setUser({ uid: cred.user.uid, email: cred.user.email || '' });
        await loadGame(cred.user.uid);
      }
      setIsOpen(false);
    } catch (err: any) {
      if (err.code === 'auth/invalid-email') {
        setError('Недопустимый логин. Используйте только буквы и цифры.');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Неверный логин или пароль.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Этот логин уже занят.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await saveGame();
    await signOut(auth);
    setUser(null);
    window.location.reload(); // Reset state
  };

  const renderForm = () => (
    <div className="relative w-full max-w-md bg-[#0f0d0b] border-2 border-[#d4af37] p-6 sm:p-8 rounded-xl shadow-2xl pointer-events-auto overflow-hidden">
      {/* Decorative sidebars */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#d4af37]" />
      <div className="absolute right-0 top-0 bottom-0 w-1 bg-[#d4af37]" />

      <div className="text-center mb-6 sm:mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/40 mb-3 sm:mb-4 text-[#d4af37]">
          {mode === 'login' ? <LogIn size={24} className="sm:size-[32px]" /> : <UserPlus size={24} className="sm:size-[32px]" />}
        </div>
        <h2 className="text-xl sm:text-2xl font-cinzel font-bold text-[#d4af37] tracking-widest uppercase">
          {mode === 'login' ? 'Вход в аккаунт' : 'Регистрация героя'}
        </h2>
        <p className="text-[#e5d3b3]/60 text-xs sm:text-sm mt-1 sm:mt-2">
          {mode === 'login' ? 'С возвращением, искатель приключений' : 'Начни свой путь к величию'}
        </p>
      </div>

      {error && (
        <div className="mb-4 sm:mb-6 p-2 sm:p-3 bg-red-900/20 border border-red-500/50 rounded flex items-start gap-2 sm:gap-3 text-red-200 text-xs sm:text-sm">
          <ShieldAlert size={14} className="shrink-0 mt-0.5 sm:size-[16px]" />
          <div className="flex flex-col gap-1">
            <span>{error}</span>
            {(error as string).includes('unauthorized-domain') && (
              <div className="mt-1 font-bold text-white p-1 bg-red-600/40 rounded">
                Добавьте <code className="bg-black/60 px-1 rounded">ephirium-beige.vercel.app</code> в список разрешенных доменов в консоли Firebase.
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleAuth} className="space-y-3 sm:space-y-4">
        <div className="space-y-1">
          <label className="text-[9px] sm:text-[10px] font-cinzel text-[#d4af37] uppercase tracking-widest ml-1">Логин</label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#d4af37]/40 sm:size-[18px]" />
            <input 
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black/40 border border-[#b8860b]/40 rounded-lg py-2.5 sm:py-3 pl-10 pr-4 text-[#e5d3b3] text-sm sm:text-base placeholder-[#e5d3b3]/20 focus:border-[#d4af37] outline-none transition-colors"
              placeholder="Ваш никнейм"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] sm:text-[10px] font-cinzel text-[#d4af37] uppercase tracking-widest ml-1">Пароль</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#d4af37]/40 sm:size-[18px]" />
            <input 
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/40 border border-[#b8860b]/40 rounded-lg py-2.5 sm:py-3 pl-10 pr-4 text-[#e5d3b3] text-sm sm:text-base placeholder-[#e5d3b3]/20 focus:border-[#d4af37] outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button 
          type="submit"
          disabled={loading}
          className={`w-full py-3 sm:py-4 mt-2 sm:mt-4 bg-[#b8860b] hover:bg-[#d4af37] text-[#1a1612] font-cinzel font-bold text-base sm:text-lg rounded-lg shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-[#1a1612]/30 border-t-[#1a1612] rounded-full animate-spin" />
          ) : (
            <>
              <ShieldCheck size={18} className="sm:size-[20px]" />
              <span>{mode === 'login' ? 'ВОЙТИ' : 'ЗАРЕГИСТРИРОВАТЬСЯ'}</span>
            </>
          )}
        </button>
      </form>

      <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-[#d4af37]/10 text-center">
        <button 
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          className="text-[#d4af37] hover:text-[#e5d3b3] text-xs sm:text-sm transition-colors font-cinzel tracking-widest underline decoration-[#d4af37]/40 underline-offset-4"
        >
          {mode === 'login' ? 'НЕТ АККАУНТА? ЗАРЕГИСТРИРУЙСЯ' : 'УЖЕ ЕСТЬ АККАУНТ? ВОЙТИ'}
        </button>
      </div>
    </div>
  );

  if (isLanding) {
    return renderForm();
  }

  return (
    <>
      {/* Auth Modal */}
      <AnimatePresence>
        {(isOpen || isLanding) && (
          <div className={`${isLanding ? 'relative flex items-center justify-center' : 'fixed inset-0 z-[200] flex items-center justify-center p-4'}`}>
            {!isLanding && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !loading && setIsOpen(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
            )}
            
            <motion.div 
              initial={isLanding ? false : { scale: 0.9, opacity: 0, y: 20 }}
              animate={isLanding ? { opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
              exit={isLanding ? { opacity: 0 } : { scale: 0.9, opacity: 0, y: 20 }}
              className="contents"
            >
              {renderForm()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
