import React, { useContext, useState } from 'react';
import * as motion from 'motion/react-client';
import { ScanEvent, Color } from '../types';
import { AuthContext } from '../App';

interface Props {
    scan: Extract<ScanEvent, { type: 'unknown' }>;
    onClose: () => void;
    colors: Color[];
}

export default function UnknownScanModal({ scan, onClose, colors }: Props) {
    const { user, token } = useContext(AuthContext);
    const [adminToken, setAdminToken] = useState<string | null>(null);
    const [modalUsername, setModalUsername] = useState('');
    const [modalPassword, setModalPassword] = useState('');
    const [authError, setAuthError] = useState('');

    const [isRegistering, setIsRegistering] = useState(false);
    const [registerError, setRegisterError] = useState('');
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('Rot');
    const [newCategory, setNewCategory] = useState('Softdrinks');
    const [newStock, setNewStock] = useState('10');

    const isAdmin = user?.role === 'admin' || !!adminToken;

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
            if (data.user.role !== 'admin') {
                throw new Error('Only admins can register new drinks');
            }
            setAdminToken(data.token);
        } catch (err: any) {
            setAuthError(err.message);
        }
    };

    const handleRegisterDrink = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegisterError('');
        setIsRegistering(true);
        try {
            const currentToken = adminToken || token || localStorage.getItem('token');
            const res = await fetch('/api/admin/drinks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
                body: JSON.stringify({
                    name: newName,
                    color_name: newColor,
                    category: newCategory,
                    stock: parseInt(newStock, 10),
                    barcode: scan.barcode
                })
            });
            if (res.ok) {
                window.dispatchEvent(new Event('refresh-drinks'));
                onClose(); // Successfully registered, close modal
            } else {
                const errorData = await res.json();
                setRegisterError(errorData.error || 'Failed to register drink');
            }
        } catch (err: any) {
            setRegisterError(err.message || 'Network error');
        } finally {
            setIsRegistering(false);
        }
    };

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
                className="relative w-full max-w-md bg-[#1A1D24] border border-red-900/50 rounded-3xl p-8 shadow-[0_0_50px_rgba(220,38,38,0.2)] flex flex-col items-center justify-center"
            >
                <div className="absolute top-4 left-6 text-[10px] font-mono text-red-500 font-bold">SYSTEM ALERT: UNKNOWN BARCODE</div>
                <div className="absolute top-4 right-6 text-[10px] font-mono text-zinc-600">SCAN: {new Date(scan.timestamp).toLocaleTimeString()}</div>

                <div className="w-full flex flex-col items-center mt-6">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                        <span className="text-3xl">?!</span>
                    </div>
                    <h2 className="text-3xl font-black text-red-500 mb-2 text-center uppercase tracking-tighter">Unknown Drink</h2>
                    <div className="font-mono text-red-400 mb-8 bg-red-950/50 border border-red-500/30 px-4 py-2 rounded-lg text-lg">
                        {scan.barcode}
                    </div>

                    {!isAdmin ? (
                        <div className="w-full">
                            <p className="text-zinc-400 text-sm mb-6 text-center">
                                This barcode is not in the system. An admin must log in to configure it.
                            </p>
                            <form onSubmit={handleIdentitySubmit} className="w-full space-y-4">
                                <div>
                                    <input
                                        type="text"
                                        value={modalUsername}
                                        onChange={e => setModalUsername(e.target.value)}
                                        className="w-full bg-[#0F1115] border border-[#2A2D35] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 font-mono"
                                        placeholder="Admin Username"
                                        autoComplete="off"
                                        required
                                    />
                                </div>
                                <div>
                                    <input
                                        type="password"
                                        value={modalPassword}
                                        onChange={e => setModalPassword(e.target.value)}
                                        className="w-full bg-[#0F1115] border border-[#2A2D35] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 font-mono"
                                        placeholder="Admin PIN"
                                        autoComplete="off"
                                        required
                                    />
                                </div>
                                {authError && <div className="text-red-400 text-sm font-mono text-center">{authError}</div>}
                                <button type="submit" className="w-full py-4 bg-red-500/20 text-red-400 border border-red-500/50 text-lg font-black rounded-xl uppercase hover:bg-red-500/30 transition-colors">
                                    Login & Configure
                                </button>
                            </form>
                        </div>
                    ) : (
                        <form onSubmit={handleRegisterDrink} className="w-full space-y-4">
                            <p className="text-zinc-400 text-sm mb-6 text-center">
                                Configure this new drink right now.
                            </p>
                            <div>
                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1 block">Drink Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    className="w-full bg-[#0F1115] border border-[#2A2D35] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                                    required
                                />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1 block">Color Code</label>
                                    <select
                                        value={newColor}
                                        onChange={e => setNewColor(e.target.value)}
                                        className="w-full bg-[#0F1115] border border-[#2A2D35] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 appearance-none"
                                    >
                                        {colors.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1 block">Category</label>
                                    <select
                                        value={newCategory}
                                        onChange={e => setNewCategory(e.target.value)}
                                        className="w-full bg-[#0F1115] border border-[#2A2D35] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 appearance-none"
                                    >
                                        <option value="Softdrinks">Softdrinks</option>
                                        <option value="Bier">Bier</option>
                                        <option value="Apfelwein">Apfelwein</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1 block">Initial Stock</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={newStock}
                                        onChange={e => setNewStock(e.target.value)}
                                        className="w-full bg-[#0F1115] border border-[#2A2D35] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 font-mono"
                                        required
                                    />
                                </div>
                            </div>
                            {registerError && <div className="text-red-400 text-sm font-mono text-center">{registerError}</div>}

                            <button disabled={isRegistering} type="submit" className="w-full py-4 mt-6 bg-amber-500 text-black text-xl font-black rounded-xl uppercase hover:bg-amber-400 transition-colors">
                                Register Drink
                            </button>
                        </form>
                    )}

                    <div className="w-full mt-4 space-y-3">
                        <button onClick={onClose} className="w-full text-zinc-500 hover:text-white py-3 font-bold uppercase tracking-widest text-[10px] transition-colors pt-2">
                            Cancel & Discard Scan
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
