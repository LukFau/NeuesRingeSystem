import { useState, useEffect, createContext, useContext } from 'react';
import { User, Drink, ScanEvent, Color } from './types';
import Login from './components/Login';
import UserDashboard from './components/UserDashboard';
import AdminDashboard from './components/AdminDashboard';
import CartModal from './components/CartModal';
import UnknownScanModal from './components/UnknownScanModal';

export const AuthContext = createContext<{
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
}>({ user: null, token: null, login: () => {}, logout: () => {} });

export default function App() {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [cart, setCart] = useState<ScanEvent[]>([]);
    const [colors, setColors] = useState<Color[]>([]);

    useEffect(() => {
        fetch('/api/colors').then(r => r.json()).then(data => setColors(data)).catch(() => {});
    }, []);

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
                setCart(prev => [...prev, scan]);
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

    const unknownScan = cart.find(c => c.type === 'unknown') as Extract<ScanEvent, { type: 'unknown' }> | undefined;

    return (
        <AuthContext.Provider value={{ user, token, login, logout }}>
            <div className="min-h-screen bg-[#0F1115] text-[#E0E0E0] font-sans flex flex-col selection:bg-amber-500/30">
                <header className="h-20 border-b border-[#2A2D35] flex items-center justify-between px-8 bg-[#15181E] sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center text-black font-bold text-xl">GW</div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-white">HerrDerRinge <span className="text-amber-500">GW</span></h1>
                        </div>
                    </div>
                    {user && (
                        <div className="flex gap-6 items-center font-mono text-xs">
                            <div className="flex items-center gap-4">
                            Hi,<span className="text-amber-500 font-bold">{user.username}</span>
                                <button
                                    onClick={logout}
                                    className="px-4 py-1.5 border border-[#3A3D45] rounded-full text-[10px] text-zinc-400 font-bold uppercase hover:bg-[#2A2D35] transition-colors"
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
                        ) : user.role === 'admin' ? (
                            <AdminDashboard />
                        ) : (
                            <UserDashboard clearScan={() => setCart([])} />
                        )}
                    </div>
                </main>

                {unknownScan ? (
                    <UnknownScanModal
                        scan={unknownScan}
                        colors={colors}
                        onClose={() => setCart(prev => prev.filter(c => c.barcode !== unknownScan.barcode))}
                    />
                ) : (
                    <CartModal
                        cart={cart}
                        setCart={setCart}
                    />
                )}
            </div>
        </AuthContext.Provider>
    );
}
