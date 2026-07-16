import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import * as motion from 'motion/react-client';

export default function CbDashboard() {
    const { token } = useContext(AuthContext);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTallies = async () => {
        try {
            const res = await fetch('/api/tallies/me', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (data.history) {
                setHistory(data.history);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTallies();
    }, [token]);

    return (
        <div className="space-y-6">
            <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <span className="text-[10px] text-amber-500 uppercase tracking-[0.2em] font-black block mb-1">System Account</span>
                        <h2 className="text-2xl md:text-3xl font-black text-white">CB Booking Overview</h2>
                    </div>
                    <button 
                        onClick={fetchTallies} 
                        className="px-4 py-2 border border-[#2A2D35] hover:border-amber-500/50 hover:text-amber-500 rounded-xl text-zinc-400 text-xs font-bold uppercase tracking-widest transition-all"
                    >
                        Refresh
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-12">
                        <div className="w-8 h-8 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
                    </div>
                ) : history.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-sm font-mono">
                        No bookings recorded on CB this month.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse font-mono text-xs">
                            <thead>
                                <tr className="border-b border-[#2A2D35] text-zinc-500 uppercase text-[9px] tracking-wider font-bold">
                                    <th className="pb-3 pr-4">Drink</th>
                                    <th className="pb-3 pr-4">Quantity</th>
                                    <th className="pb-3 pr-4">Date</th>
                                    <th className="pb-3">Responsible</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((log) => (
                                    <motion.tr 
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        key={log.id} 
                                        className="border-b border-[#2A2D35]/50 last:border-0 text-white hover:bg-white/[0.02]"
                                    >
                                        <td className="py-3.5 pr-4 font-bold">{log.drink_name}</td>
                                        <td className="py-3.5 pr-4 text-zinc-400 font-bold">{log.quantity}x</td>
                                        <td className="py-3.5 pr-4 text-zinc-500">
                                            {new Date(log.date).toLocaleString('de-DE', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </td>
                                        <td className="py-3.5">
                                            <span className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-[10px] font-bold">
                                                {log.responsible || 'N/A'}
                                            </span>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
