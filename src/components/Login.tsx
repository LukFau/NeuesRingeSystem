import { useState, useContext } from 'react';
import React from 'react';
import { AuthContext } from '../App';
import * as motion from 'motion/react-client';

export default function Login() {
  const { login } = useContext(AuthContext);
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-sm mx-auto mt-20"
    >
      <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-8 shadow-2xl relative">
        <h2 className="text-3xl font-bold tracking-tight text-white mb-6">
          {isRegister ? 'Create Account' : 'Welcome Back'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-[#0F1115] border border-[#2A2D35] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
              placeholder="Phritte"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2">PIN / Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#0F1115] border border-[#2A2D35] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
              placeholder="1234"
              required
            />
          </div>
          
          {error && <div className="text-red-400 text-sm font-mono">{error}</div>}
          
          <button 
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-400 text-black text-lg py-4 font-black rounded-xl uppercase tracking-tighter shadow-[0_0_30px_rgba(245,158,11,0.2)] transition-colors mt-2"
          >
            {isRegister ? 'Sign Up' : 'Sign In'}
          </button>
        </form>
        
        <div className="mt-8 text-center border-t border-[#2A2D35] pt-6">
          <button 
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-zinc-500 font-bold uppercase tracking-widest hover:text-white transition-colors"
          >
            {isRegister ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
