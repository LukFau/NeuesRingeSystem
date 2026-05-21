import { useContext, useState, useEffect } from 'react';
import * as motion from 'motion/react-client';
import { ScanEvent } from '../types';
import { AuthContext } from '../App';
import QRCode from 'react-qr-code';

interface Props {
    scan: ScanEvent | null;
    onClose: () => void;
}

export default function ScanModal({ scan, onClose }: Props) {
    const { token, user } = useContext(AuthContext);
    const [step, setStep] = useState<'identity' | 'quantity' | 'qr'>('identity');
    const [qty, setQty] = useState(1);
    const [tempMode, setTempMode] = useState<'user' | 'guest' | null>(null);
    const [tempToken, setTempToken] = useState<string | null>(null);
    const [modalUsername, setModalUsername] = useState('');
    const [modalPassword, setModalPassword] = useState('');
    const [authError, setAuthError] = useState('');

    useEffect(() => {
        if (scan) {
            setQty(1);
            // Skip login if already logged in (but not as admin, since admin don't buy)
            if (user && token && user.role !== 'admin') {
                setStep('quantity');
                setTempMode('user');
                setTempToken(token);
            } else {
                setStep('identity');
                setTempMode(null);
                setTempToken(null);
                setModalUsername('');
                setModalPassword('');
                setAuthError('');
            }
        }
    }, [scan, user, token]);

    if (!scan) return null;

    const handleIdentitySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError('');
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: modalUsername, password: modalPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setTempToken(data.token);
            setTempMode('user');
            setStep('quantity');
        } catch (err: any) {
            setAuthError(err.message);
        }
    };

    const handleBuchen = async () => {
        if (!tempToken) return;
        try {
            await fetch('/api/tallies', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tempToken}`
                },
                body: JSON.stringify({ drinkId: (scan as any).id, quantity: qty })
            });
            window.dispatchEvent(new Event('refresh-tallies'));
            onClose();
        } catch (err) {
            console.error(err);
        }
    };

    const handleGuestCheckout = async () => {
        try {
            await fetch('/api/guest-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drinkId: (scan as any).id, quantity: qty })
            });
            window.dispatchEvent(new Event('refresh-tallies'));
            setStep('qr');
        } catch (err) {
            console.error(err);
        }
    };

    const paypalUser = import.meta.env.VITE_PAYPAL_USERNAME || 'exampleuser';
    const totalPrice = (scan.price * qty).toFixed(2);
    const qrData = `https://paypal.me/${paypalUser}/${totalPrice}EUR`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-[#0F1115]/90 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative w-full max-w-md bg-[#1A1D24] border border-[#2A2D35] rounded-3xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center"
            >
                <div className="absolute top-4 left-6 text-[10px] font-mono text-zinc-600">INPUT REGISTERED</div>
                <div className="absolute top-4 right-6 text-[10px] font-mono text-zinc-600">SCAN: {new Date(scan.timestamp).toLocaleTimeString()}</div>

                {step === 'identity' && (
                    <div className="w-full flex flex-col items-center mt-6">
                        <h2 className="text-3xl font-bold text-white mb-6">Identity Verification</h2>
                        <form onSubmit={handleIdentitySubmit} className="w-full space-y-4">
                            <div>
                                <input
                                    type="text"
                                    value={modalUsername}
                                    onChange={e => setModalUsername(e.target.value)}
                                    className="w-full bg-[#0F1115] border border-[#2A2D35] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 font-mono"
                                    placeholder="Username"
                                    autoComplete="off"
                                    required
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    value={modalPassword}
                                    onChange={e => setModalPassword(e.target.value)}
                                    className="w-full bg-[#0F1115] border border-[#2A2D35] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 font-mono"
                                    placeholder="PIN"
                                    autoComplete="off"
                                    required
                                />
                            </div>
                            {authError && <div className="text-red-400 text-sm font-mono text-center">{authError}</div>}
                            <button type="submit" className="w-full py-4 bg-amber-500 text-black text-xl font-black rounded-xl uppercase hover:bg-amber-400 transition-colors">
                                Login & Continue
                            </button>
                        </form>
                        <div className="w-full mt-4 space-y-3">
                            <button
                                onClick={() => { setTempMode('guest'); setStep('quantity'); }}
                                className="w-full py-4 bg-[#0F1115] border border-[#2A2D35] rounded-xl text-white font-bold uppercase tracking-widest text-sm hover:bg-[#15181E] transition-colors"
                            >
                                Continue as Guest
                            </button>
                            <button onClick={onClose} className="w-full text-zinc-500 hover:text-white py-3 font-bold uppercase tracking-widest text-[10px] transition-colors pt-2">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {step === 'quantity' && (
                    <div className="w-full flex flex-col items-center mt-6">
                        <span className="text-amber-500 font-mono text-sm tracking-tighter mb-1">SCANNED ITEM</span>
                        <h2 className="text-4xl font-bold text-white mb-2">{scan.name}</h2>
                        <div className="text-5xl font-mono font-bold text-white tracking-tighter mb-8 mt-4">€{totalPrice}</div>

                        <div className="flex items-center justify-center gap-10 mb-8 border border-[#2A2D35] p-3 rounded-2xl bg-[#0F1115]">
                            <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-14 h-14 rounded-full border border-[#2A2D35] flex items-center justify-center text-3xl text-zinc-400 hover:bg-[#15181E] active:scale-95 transition-all">−</button>
                            <div className="flex flex-col items-center">
                                <span className="text-5xl font-black text-white px-4 leading-none">{qty}</span>
                            </div>
                            <button onClick={() => setQty(qty + 1)} className="w-14 h-14 rounded-full border border-amber-500/50 flex items-center justify-center text-3xl text-amber-500 hover:bg-amber-500/10 active:scale-95 transition-all">+</button>
                        </div>

                        <div className="w-full space-y-3">
                            {tempMode === 'user' ? (
                                <button onClick={handleBuchen} className="w-full py-5 bg-amber-500 text-black text-xl font-black rounded-xl uppercase tracking-tighter shadow-[0_0_30px_rgba(245,158,11,0.2)] hover:bg-amber-400 transition-colors">
                                    Buchen
                                </button>
                            ) : (
                                <button onClick={handleGuestCheckout} className="w-full py-5 bg-emerald-500 text-black text-xl font-black rounded-xl uppercase tracking-tighter shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:bg-emerald-400 transition-colors">
                                    Bezahlen
                                </button>
                            )}
                            <button onClick={onClose} className="w-full text-zinc-500 hover:text-white py-3 font-bold uppercase tracking-widest text-[10px] transition-colors pt-4">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {step === 'qr' && (
                    <div className="w-full flex flex-col items-center">
                        <h4 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4 mt-6">Guest Checkout</h4>
                        <div className="bg-white p-6 rounded-2xl mb-6 shadow-xl border-4 border-[#2A2D35]">
                            <QRCode value={qrData} size={180} />
                        </div>
                        <p className="text-xs text-zinc-400 mb-8 px-4 text-center">
                            Scan with your phone to instantly pay <span className="text-white font-mono font-bold">€{totalPrice}</span> via PayPal.
                        </p>
                        <div className="w-full space-y-3">
                            <button onClick={onClose} className="w-full py-4 bg-zinc-800 text-white font-bold rounded-xl uppercase hover:bg-zinc-700 transition">
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
