import { useState, useEffect, createContext, useContext } from 'react';
import { User, Drink, ScanEvent } from './types';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ScanModal from './components/ScanModal';

export const AuthContext = createContext<{
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}>({ user: null, token: null, login: () => {}, logout: () => {} });

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [currentScan, setCurrentScan] = useState<ScanEvent | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }

    const eventSource = new EventSource('/api/scans/stream');
    eventSource.onmessage = (e) => {
      if (e.data === ':ping') return;
      try {
        const scan = JSON.parse(e.data);
        setCurrentScan(scan);
      } catch (err) {}
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      <div className="min-h-screen bg-[#0F1115] text-[#E0E0E0] font-sans flex flex-col selection:bg-amber-500/30">
        <header className="h-20 border-b border-[#2A2D35] flex items-center justify-between px-8 bg-[#15181E] sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center text-black font-bold text-xl">B</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">BEV-TALLY <span className="text-amber-500">PRO</span></h1>
              <p className="hidden md:block text-[10px] text-zinc-500 uppercase tracking-widest font-mono">System: Raspberry Pi 4 // Node.js</p>
            </div>
          </div>
          {user && (
            <div className="flex gap-6 items-center font-mono text-xs">
              <div className="hidden md:flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                <span className="text-zinc-400">HARDWARE: ONLINE</span>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={logout}
                  className="px-10 py-4 border border-[#3A3D45] rounded-full text-[14px] text-zinc-400 font-bold uppercase hover:bg-[#2A2D35] transition-colors"
                >
                  Log Out
                </button>
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 p-4 md:p-8 flex justify-center">
          <div className="w-full max-w-5xl">
            {!user ? (
              <Login />
            ) : (
              <Dashboard clearScan={() => setCurrentScan(null)} />
            )}
          </div>
        </main>

        <ScanModal 
          scan={currentScan} 
          onClose={() => setCurrentScan(null)} 
        />
      </div>
    </AuthContext.Provider>
  );
}
