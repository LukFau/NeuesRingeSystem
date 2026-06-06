import { useState, useEffect, createContext, useContext } from 'react';
import { User, Drink, ScanEvent, Color } from './types';
import Login from './components/Login';
import UserDashboard from './components/UserDashboard';
import AdminDashboard from './components/AdminDashboard';
import CartModal from './components/CartModal';
import UnknownScanModal from './components/UnknownScanModal';
import MobileScannerModal from './components/MobileScannerModal';
import { Camera } from 'lucide-react';

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
    const [isScannerOpen, setIsScannerOpen] = useState(false);

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

    const handleMobileScan = async (barcode: string) => {
        try {
            const response = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barcode, source: 'mobile' })
            });
            const data = await response.json();

            if (response.ok && data.drink) {
                setCart(prev => [...prev, data.drink]);
            } else if (!response.ok && data.scanEvent) {
                setCart(prev => [...prev, data.scanEvent]);
            }
        } catch (err) {
            console.error('Failed to report scan', err);
        }
    };

    const unknownScan = cart.find(c => c.type === 'unknown') as Extract<ScanEvent, { type: 'unknown' }> | undefined;

    return (
        <AuthContext.Provider value={{ user, token, login, logout }}>
            <div className="min-h-screen bg-[#0F1115] text-[#E0E0E0] font-sans flex flex-col selection:bg-amber-500/30 relative">
                <header className="h-20 border-b border-[#2A2D35] flex items-center justify-between px-8 bg-[#15181E] sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center text-black font-bold text-xl cursor-default">GW</div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-white hidden sm:block">HerrDerRinge <span className="text-amber-500">GW</span></h1>
                        </div>
                    </div>
                    {user && (
                        <div className="flex gap-4 md:gap-6 items-center font-mono text-xs">
                            <div className="flex items-center gap-4">
                                <span className="hidden sm:inline">Hi,</span><span className="text-amber-500 font-bold max-w-[100px] truncate">{user.username}</span>
                                <button
                                    onClick={logout}
                                    className="px-3 md:px-4 py-1.5 border border-[#3A3D45] rounded-full text-[10px] text-zinc-400 font-bold uppercase hover:bg-[#2A2D35] transition-colors"
                                >
                                    Log Out
                                </button>
                            </div>
                        </div>
                    )}
                </header>

                <main className="flex-1 p-4 md:p-8 flex justify-center pb-24">
                    <div className="w-full max-w-5xl">
                        {!user ? (
                            <Login />
                        ) : user.role === 'admin' ? (
                            <AdminDashboard />
                        ) : (
                            <UserDashboard
                                clearScan={() => setCart([])}
                                addToCart={(drink) => setCart(prev => [...prev, { ...drink, type: 'drink', scannerId: 'manual' }])}
                            />
                        )}
                    </div>
                </main>

                {!user && (
                    <>
                        {/* Global floating scanner button */}
                        <button
                            onClick={() => setIsScannerOpen(true)}
                            className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-0 w-16 h-16 bg-amber-500 hover:bg-amber-400 flex items-center justify-center rounded-full shadow-[0_0_30px_rgba(245,158,11,0.3)] transition-transform hover:scale-105 active:scale-95"
                        >
                            <Camera className="w-7 h-7 text-black" />
                        </button>

                        {isScannerOpen && (
                            <MobileScannerModal
                                onClose={() => setIsScannerOpen(false)}
                                onScan={handleMobileScan}
                            />
                        )}
                    </>
                )}

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
