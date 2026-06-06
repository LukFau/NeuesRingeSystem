import React, { useContext, useState, useEffect } from 'react';
import * as motion from 'motion/react-client';
import { ScanEvent } from '../types';
import { AuthContext } from '../App';
import QRCode from 'react-qr-code';

interface Props {
    cart: ScanEvent[];
    setCart: React.Dispatch<React.SetStateAction<ScanEvent[]>>;
}

export default function CartModal({ cart, setCart }: Props) {
    const { token, user, login, logout } = useContext(AuthContext);
    const [step, setStep] = useState<'identity' | 'cart' | 'qr'>('identity');
    const [tempMode, setTempMode] = useState<'user' | 'guest' | null>(null);
    const [tempToken, setTempToken] = useState<string | null>(null);
    const [modalUsername, setModalUsername] = useState('');
    const [modalPassword, setModalPassword] = useState('');
    const [authError, setAuthError] = useState('');

    const [paypalUser, setPaypalUser] = useState(import.meta.env.VITE_PAYPAL_USERNAME || 'exampleuser');
    const [weroUser, setWeroUser] = useState('');

    useEffect(() => {
        fetch('/api/settings/public').then(r => r.json()).then(data => {
            if (data.paypal_username) setPaypalUser(data.paypal_username);
            if (data.wero_username) setWeroUser(data.wero_username);
        }).catch(() => {});
    }, []);

    // Group items by id
    const groupedCart = cart.reduce((acc, scan) => {
        if (scan.type === 'unknown') return acc; // Skip for now
        if (!acc[scan.id]) acc[scan.id] = { ...scan, quantity: 0 };
        acc[scan.id].quantity += 1;
        return acc;
    }, {} as Record<number, ScanEvent & { quantity: number; type: 'known' }>);

    const items = Object.values(groupedCart);

    useEffect(() => {
        if (cart.length > 0) {
            if (user && token && user.role !== 'admin') {
                setStep('cart');
                setTempMode('user');
                setTempToken(token);
            } else if (step === 'cart' || step === 'qr') {
                // stay in step
            } else {
                setStep('identity');
                setTempMode(null);
                setTempToken(null);
            }
        } else {
            setStep('identity');
            setTempMode(null);
            setTempToken(null);
            setModalUsername('');
            setModalPassword('');
            setAuthError('');
        }
    }, [cart, user, token, step]);

    if (cart.length === 0) return null;
    const unknownScan = cart.find(c => c.type === 'unknown');
    if (unknownScan) return null; // Handled by UnknownScanModal

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
            setStep('cart');
            // Do NOT log the user into the regular website when they login via popup
        } catch (err: any) {
            setAuthError(err.message);
        }
    };

    const clearAll = () => setCart([]);


    const handleBuchen = async () => {
        if (!tempToken) return;
        try {
            const promises = items.map(item =>
                fetch('/api/tallies', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${tempToken}`
                    },
                    body: JSON.stringify({ drinkId: item.id, quantity: item.quantity })
                })
            );
            await Promise.all(promises);
            window.dispatchEvent(new Event('refresh-tallies'));
            clearAll();

            // Only log out if it was a physical scan (not a manual Quick Book)
            const isQuickBook = cart.every(i => i.scannerId === 'manual');
            if (!isQuickBook) {
                logout();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handlePaypalWeChat = (type: 'paypal_me' | 'paypal_webscr' | 'wero', items: any[]) => {
        const totalPricePaypal = items.reduce((acc: any, item: any) => acc + item.price * item.quantity, 0).toFixed(2);

        switch (type) {
            case 'paypal_me':
                window.open(`https://paypal.me/${paypalUser}/${totalPricePaypal}EUR`, '_blank');
                break;
            case 'paypal_webscr':
                window.open(`https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${paypalUser}&item_name=Drinks&amount=${totalPricePaypal}&currency_code=EUR`, '_blank');
                break;
            case 'wero':
                // Wero typically uses a banking scheme deep link or a generic Wero link if supported, we can fallback to text copy/clipboard if we don't have deep link, but since we are trying payment solutions, providing standard scheme or informative alert if not deep linking.
                alert(`Please send €${totalPricePaypal} via Wero to: ${weroUser}`);
                break;
        }
    };

    const handleGuestCheckout = async (payType?: 'paypal_me' | 'paypal_webscr' | 'wero') => {
        try {
            const promises = items.map(item =>
                fetch('/api/guest-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ drinkId: item.id, quantity: item.quantity })
                })
            );
            await Promise.all(promises);
            window.dispatchEvent(new Event('refresh-tallies'));

            if (payType) {
                handlePaypalWeChat(payType, items);
            }
            clearAll();
        } catch (err) {
            console.error(err);
        }
    };

    const handlePaypalCheckout = async (payType: 'paypal_me' | 'paypal_webscr' | 'wero') => {
        if (!tempToken) return;
        try {
            const promises = items.map(item =>
                fetch('/api/tallies', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${tempToken}`
                    },
                    body: JSON.stringify({ drinkId: item.id, quantity: item.quantity, payViaPayPal: true })
                })
            );
            await Promise.all(promises);
            window.dispatchEvent(new Event('refresh-tallies'));

            handlePaypalWeChat(payType, items);

            // Clear cart/close popup
            clearAll();

            // Only log out if it was a physical scan (not a manual Quick Book)
            const isQuickBook = cart.every(i => i.scannerId === 'manual');
            if (!isQuickBook) {
                logout();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const updateQuantity = (id: number, delta: number) => {
        setCart(prev => {
            const remainingItems = prev.filter(p => (p as any).id !== id);
            const targetItems = prev.filter(p => (p as any).id === id);
            if (delta > 0) {
                // Need to add item
                return [...prev, targetItems[0]];
            } else {
                // Need to remove one item
                targetItems.pop();
                return [...remainingItems, ...targetItems];
            }
        });
    };

    const totalPrice = items.reduce((acc, item) => acc + item.price * item.quantity, 0).toFixed(2);
    const qrData = `https://paypal.me/${paypalUser}/${totalPrice}EUR`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-[#0F1115]/90 backdrop-blur-sm"
                onClick={clearAll}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative w-full max-w-md bg-[#1A1D24] border border-[#2A2D35] rounded-3xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center"
            >
                <div className="absolute top-4 left-6 text-[10px] font-mono text-zinc-600">CART ({cart.length} ITEMS)</div>
                <div className="absolute top-4 right-6 text-[10px] font-mono text-zinc-600">TOTAL: €{totalPrice}</div>

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
                                onClick={() => { setTempMode('guest'); setStep('cart'); }}
                                className="w-full py-4 bg-[#0F1115] border border-[#2A2D35] rounded-xl text-white font-bold uppercase tracking-widest text-sm hover:bg-[#15181E] transition-colors"
                            >
                                Continue as Guest
                            </button>
                            <button onClick={clearAll} className="w-full text-zinc-500 hover:text-white py-3 font-bold uppercase tracking-widest text-[10px] transition-colors pt-2">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {step === 'cart' && (
                    <div className="w-full flex flex-col items-center mt-6">
                        <span className="text-amber-500 font-mono text-xs tracking-tighter mb-4">
                            {cart.every(i => i.scannerId === 'manual') ? 'QUICK BOOK CART' : 'SCANNED ITEMS'}
                        </span>

                        <div className="w-full max-h-64 overflow-y-auto mb-6 space-y-3">
                            {items.map(item => (
                                <div key={item.id} className="flex items-center justify-between bg-[#0F1115] border border-[#2A2D35] p-4 rounded-xl">
                                    <div>
                                        <div className="font-bold text-white text-lg">{item.name}</div>
                                        <div className="text-zinc-500 text-xs font-mono mt-1">€{item.price.toFixed(2)} / ea</div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 rounded-full border border-[#2A2D35] text-zinc-400 hover:bg-[#15181E]">−</button>
                                        <span className="text-xl font-black text-white">{item.quantity}</span>
                                        <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 rounded-full border border-amber-500/50 text-amber-500 hover:bg-amber-500/10">+</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="text-sm font-mono text-zinc-400 mb-6 text-center">
                            {(() => {
                                const isQuickBook = cart.every(i => i.scannerId === 'manual');
                                return isQuickBook ? 'Add more drinks or checkout' : 'You can keep scanning barcodes...';
                            })()}
                        </div>

                        <div className="w-full space-y-3">
                            {tempMode === 'user' ? (
                                <>
                                    <button onClick={handleBuchen} className="w-full py-5 bg-amber-500 text-black text-xl font-black rounded-xl uppercase tracking-tighter shadow-[0_0_30px_rgba(245,158,11,0.2)] hover:bg-amber-400 transition-colors">
                                        Buchen (€{totalPrice})
                                    </button>
                                    <button onClick={() => handlePaypalCheckout('paypal_me')} className="w-full py-4 bg-[#0070BA] text-white text-lg font-black rounded-xl uppercase tracking-tighter hover:bg-[#003087] transition-colors">
                                        PayPal.me
                                    </button>
                                    <button onClick={() => handlePaypalCheckout('paypal_webscr')} className="w-full py-4 bg-[#0070BA] text-white text-lg font-black rounded-xl uppercase tracking-tighter hover:bg-[#003087] transition-colors">
                                        PayPal Checkout (Mobile)
                                    </button>
                                    {weroUser && (
                                        <button onClick={() => handlePaypalCheckout('wero')} className="w-full py-4 bg-purple-600 text-white text-lg font-black rounded-xl uppercase tracking-tighter hover:bg-purple-500 transition-colors">
                                            Pay with Wero
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    <button onClick={() => handleGuestCheckout('paypal_me')} className="w-full py-4 bg-[#0070BA] text-white text-lg font-black rounded-xl uppercase tracking-tighter hover:bg-[#003087] transition-colors">
                                        Pay with PayPal.me
                                    </button>
                                    <button onClick={() => handleGuestCheckout('paypal_webscr')} className="w-full py-4 bg-[#0070BA] text-white text-lg font-black rounded-xl uppercase tracking-tighter hover:bg-[#003087] transition-colors">
                                        PayPal Checkout (Mobile)
                                    </button>
                                    {weroUser && (
                                        <button onClick={() => handleGuestCheckout('wero')} className="w-full py-4 bg-purple-600 text-white text-lg font-black rounded-xl uppercase tracking-tighter hover:bg-purple-500 transition-colors">
                                            Pay with Wero
                                        </button>
                                    )}
                                </>
                            )}
                            <button onClick={clearAll} className="w-full text-zinc-500 hover:text-white py-3 font-bold uppercase tracking-widest text-[10px] transition-colors pt-4">
                                Cancel All
                            </button>
                        </div>
                    </div>
                )}

                {step === 'qr' && (
                    <div className="w-full flex flex-col items-center">
                        <h4 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4 mt-6">Scan to Pay</h4>
                        <div className="bg-white p-6 rounded-2xl mb-6 shadow-xl border-4 border-[#2A2D35] hidden sm:block">
                            <QRCode value={qrData} size={180} />
                        </div>
                        <p className="text-xs text-zinc-400 mb-6 px-4 text-center hidden sm:block">
                            Scan with your phone to instantly pay <span className="text-white font-mono font-bold">€{totalPrice}</span> via PayPal.
                        </p>

                        <a
                            href={qrData}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:hidden py-4 bg-[#0070BA] text-white font-bold rounded-xl uppercase hover:bg-[#003087] transition flex justify-center items-center mb-6"
                        >
                            Open PayPal (€{totalPrice})
                        </a>

                        <div className="w-full space-y-3">
                            <button onClick={clearAll} className="w-full py-4 bg-zinc-800 text-white font-bold rounded-xl uppercase hover:bg-zinc-700 transition">
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
