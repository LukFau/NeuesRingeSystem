import { useState, useEffect, useContext, useMemo } from 'react';
import { AuthContext } from '../App';
import * as motion from 'motion/react-client';
import { UserStats } from '../types';
import { Beer, Heart, TrendingUp, ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { useToast } from './Toast';

export default function UserDashboard({ clearScan, addToCart }: { clearScan: () => void, addToCart: (drink: any) => void }) {
    const { token, user, updateUser } = useContext(AuthContext);
    const toast = useToast();
    const [monthOffset, setMonthOffset] = useState<number>(0);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [leaderboard, setLeaderboard] = useState<{ username: string, total_drinks: number, avatar?: string }[]>([]);
    const [leaderboardCategory, setLeaderboardCategory] = useState<string>('All');
    const [achievements, setAchievements] = useState<any[]>([]);
    const [drinks, setDrinks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchDrinks = async () => {
        try {
            const res = await fetch('/api/drinks');
            const data = await res.json();
            setDrinks(data);
        } catch (err) { }
    };

    const fetchTallies = async () => {
        try {
            const res = await fetch(`/api/tallies/me?offset=${monthOffset}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setStats(data);
        } catch (err) { }
    };

    const fetchLeaderboard = async () => {
        try {
            const params = new URLSearchParams();
            if (leaderboardCategory !== 'All') {
                params.append('category', leaderboardCategory);
            }
            params.append('offset', String(monthOffset));
            const res = await fetch('/api/leaderboard?' + params.toString(), { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setLeaderboard(data);
        } catch (err) { }
    };

    const fetchAchievements = async () => {
        try {
            const res = await fetch('/api/users/achievements', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setAchievements(data);
        } catch (err) { }
    };

    const bookCrate = async (drinkId: number) => {
        try {
            const res = await fetch('/api/tallies/crate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ drinkId })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success('Kasten booked successfully!', {
                    action: {
                        label: 'Undo',
                        onClick: async () => {
                            try {
                                const delRes = await fetch(`/api/tallies/${data.logId}`, {
                                    method: 'DELETE',
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });
                                if (delRes.ok) {
                                    toast.success('Booking undone');
                                    fetchTallies();
                                    fetchDrinks();
                                    fetchLeaderboard();
                                } else {
                                    const delData = await delRes.json();
                                    toast.error(delData.error || 'Failed to undo booking');
                                }
                            } catch (err) {
                                toast.error('Failed to undo booking');
                            }
                        }
                    }
                });
                fetchTallies();
                fetchDrinks();
                fetchLeaderboard();
            } else {
                toast.error(data.error || 'Failed to book Kasten');
            }
        } catch (err) {
            toast.error('Failed to book Kasten');
        }
    };

    useEffect(() => {
        fetchLeaderboard();
    }, [leaderboardCategory, monthOffset]);

    useEffect(() => {
        fetchTallies();
    }, [monthOffset]);

    useEffect(() => {
        Promise.all([fetchTallies(), fetchLeaderboard(), fetchAchievements(), fetchDrinks()]).finally(() => setLoading(false));
        const handleRefresh = () => { fetchTallies(); fetchLeaderboard(); fetchAchievements(); fetchDrinks(); };
        window.addEventListener('refresh-tallies', handleRefresh);
        return () => window.removeEventListener('refresh-tallies', handleRefresh);
    }, [token, monthOffset]);

    const chartData = useMemo(() => {
        return stats ? Object.keys(stats.colors).map(cName => ({
            name: cName,
            count: stats.colors[cName]
        })) : [];
    }, [stats]);

    // Favorite drinks
    const favoriteDrinks = useMemo(() => {
        const drinkCounts: Record<string, number> = {};
        if (stats?.history) {
            stats.history.forEach(log => {
                drinkCounts[log.drink_name] = (drinkCounts[log.drink_name] || 0) + log.quantity;
            });
        }
        return Object.entries(drinkCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
    }, [stats]);

    // Trend Data
    const trendChartData = useMemo(() => {
        const trendByDate: Record<string, number> = {};
        if (stats?.history) {
            stats.history.forEach(log => {
                const d = new Date(log.date).toISOString().split('T')[0];
                trendByDate[d] = (trendByDate[d] || 0) + log.quantity;
            });
        }
        return Object.keys(trendByDate).sort().map(d => ({
            date: new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            count: trendByDate[d]
        }));
    }, [stats]);

    if (loading) return <div className="text-center text-zinc-500 font-mono tracking-widest uppercase mt-20 text-xs">Loading datastore...</div>;

    const uiColors: Record<string, string> = {
        'Rot': '#ef4444',
        'Braun': '#78350f',
        'Grün': '#22c55e',
        'Schwarz': '#0f172a',
        'Blau': '#3b82f6'
    };



    const getMonthName = (offset: number) => {
        const d = new Date();
        d.setMonth(d.getMonth() + offset);
        return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">



            {user?.role === 'philister' && (
                <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-xl relative animate-fade-in">
                    <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-500" /> Kästen Quick Book
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {drinks.filter(d => d.is_active && d.crate_price !== null && Number(d.crate_price) > 0).map(drink => (
                            <div
                                key={drink.id}
                                className="bg-[#0F1115] border border-[#2A2D35] rounded-xl p-4 flex flex-col justify-between gap-4 hover:border-amber-500/30 transition-all relative overflow-hidden"
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <div className="text-white text-sm font-bold truncate">{drink.name}</div>
                                    <div className="text-amber-500 font-mono text-sm font-black whitespace-nowrap">
                                        €{Number(drink.crate_price).toFixed(2)}
                                    </div>
                                </div>
                                <button
                                    onClick={() => bookCrate(drink.id)}
                                    className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-xs font-bold uppercase tracking-widest transition-all hover:shadow-lg hover:shadow-amber-500/10"
                                >
                                    Kasten Buchen
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-xl relative">
                <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Beer className="w-4 h-4 text-amber-500" /> Quick Book
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {drinks.filter(d => d.is_active).map(drink => (
                        <button
                            key={drink.id}
                            onClick={() => addToCart(drink)}
                            className="bg-[#0F1115] border border-[#2A2D35] hover:border-amber-500/50 hover:bg-[#15181E] rounded-xl p-3 flex flex-col items-center justify-center gap-2 transition text-left relative overflow-hidden"
                        >
                            <div className="text-white text-xs font-bold text-center">{drink.name}</div>
                            <div className="text-amber-500 font-mono text-[10px]">€{drink.price.toFixed(2)}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Month Selector */}
            <div className="flex items-center justify-between bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-4 shadow-xl">
                <button
                    onClick={() => setMonthOffset(prev => prev - 1)}
                    className="p-2 border border-[#2A2D35] hover:border-amber-500/50 hover:bg-[#15181E] text-zinc-400 hover:text-white rounded-xl transition flex items-center justify-center"
                    title="Previous Month"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="text-white font-bold tracking-widest text-xs uppercase font-mono">
                    {getMonthName(monthOffset)}
                </div>
                <button
                    disabled={monthOffset >= 0}
                    onClick={() => setMonthOffset(prev => prev + 1)}
                    className="p-2 border border-[#2A2D35] hover:border-amber-500/50 hover:bg-[#15181E] text-zinc-400 hover:text-white rounded-xl transition disabled:opacity-30 disabled:hover:border-[#2A2D35] disabled:hover:bg-transparent disabled:text-zinc-700 flex items-center justify-center"
                    title="Next Month"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 md:p-8 flex items-center justify-between shadow-2xl relative">
                    <div>
                        <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-2">
                            {monthOffset === 0 ? "Total Monthly Due" : `Total Due in ${getMonthName(monthOffset)}`}
                        </h2>
                        <div className="text-4xl md:text-5xl font-mono font-bold text-amber-500 tracking-tighter">
                            €{(stats?.totalSpent || 0).toFixed(2)}
                        </div>
                    </div>
                    <div className="p-4 bg-[#0F1115] rounded-full border border-[#2A2D35]">
                        <Beer className="w-8 h-8 text-amber-500" />
                    </div>
                </div>

                <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-xl flex flex-col justify-center relative overflow-hidden">
                    <h3 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-4 flex items-center gap-2 relative z-10">
                        <Heart className="w-4 h-4 text-rose-500" /> Top 3 Favorites
                    </h3>
                    {favoriteDrinks.length > 0 ? (
                        <div className="space-y-3 relative z-10">
                            {favoriteDrinks.map(([name, count], i) => (
                                <div key={name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-zinc-500 font-mono text-xs">{i + 1}.</span>
                                        <span className="text-white font-medium">{name}</span>
                                    </div>
                                    <span className="text-amber-500 font-mono text-sm">x{count}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-zinc-500 font-mono text-xs text-center py-4 relative z-10">No favorites yet</div>
                    )}
                    <Heart className="absolute -right-8 -bottom-8 w-40 h-40 text-rose-500/5 rotate-12" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-xl">
                    <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">
                        Consumption by Color
                    </h3>
                    {chartData.length > 0 ? (
                        <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <XAxis dataKey="name" stroke="#52525b" tick={{ fill: '#a1a1aa' }} />
                                    <YAxis stroke="#52525b" tick={{ fill: '#a1a1aa' }} allowDecimals={false} />
                                    <Tooltip cursor={{ fill: '#2A2D35' }} contentStyle={{ backgroundColor: '#0F1115', border: '1px solid #2A2D35', color: '#fff' }} itemStyle={{ color: '#fff' }} />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={uiColors[entry.name] || '#8b5cf6'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-zinc-500 font-mono text-xs">NO DATA AVAILABLE</div>
                    )}
                </div>

                <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" /> Consumption Trend
                    </h3>
                    {trendChartData.length > 0 ? (
                        <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2D35" vertical={false} />
                                    <XAxis dataKey="date" stroke="#52525b" tick={{ fill: '#a1a1aa', fontSize: 10 }} tickMargin={10} minTickGap={20} />
                                    <YAxis stroke="#52525b" tick={{ fill: '#a1a1aa', fontSize: 10 }} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0F1115', border: '1px solid #2A2D35', color: '#fff' }}
                                        itemStyle={{ color: '#10b981' }}
                                        labelStyle={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}
                                    />
                                    <Line type="monotone" dataKey="count" name="Drinks" stroke="#10b981" strokeWidth={3} dot={{ fill: '#0F1115', stroke: '#10b981', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: '#10b981', stroke: '#0F1115' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-zinc-500 font-mono text-xs">NO DATA AVAILABLE</div>
                    )}
                </div>
            </div>

            <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                    <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <Beer className="w-4 h-4 text-amber-500" /> Leaderboard
                    </h3>
                    <div className="flex bg-[#0F1115] border border-[#2A2D35] p-1 rounded-lg">
                        {['All', 'Bier', 'Apfelwein', 'Softdrinks'].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setLeaderboardCategory(cat)}
                                className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${leaderboardCategory === cat
                                    ? 'bg-[#2A2D35] text-amber-500'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
                {leaderboard.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {leaderboard.map((user, index) => (
                            <div key={user.username} className="flex items-center justify-between bg-[#15181E] border border-[#2A2D35] rounded-xl p-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black ${index === 0 ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]' : index === 1 ? 'bg-zinc-300 text-black shadow-[0_0_10px_rgba(212,212,216,0.3)]' : index === 2 ? 'bg-amber-700 text-white shadow-[0_0_10px_rgba(180,83,9,0.3)]' : 'bg-[#2A2D35] text-zinc-400'}`}>
                                        {user.avatar ? <span className="text-lg">{user.avatar}</span> : (index + 1)}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-white font-medium flex items-center gap-2">
                                            {user.username}
                                        </span>
                                        {index === 0 && <span className="text-[9px] text-amber-500 uppercase font-bold tracking-widest mt-0.5">Top Drinker 👑</span>}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-amber-500 font-mono font-bold text-lg">{user.total_drinks}</span>
                                    <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">Drinks</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 text-zinc-500 font-mono text-xs">NO DATA THIS MONTH</div>
                )}
            </div>

            <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-emerald-500" /> Achievements
                </h3>
                {achievements.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {achievements.map((ach) => (
                            <div key={ach.id} className={`flex flex-col items-center p-4 rounded-xl border ${ach.unlocked ? 'bg-[#15181E] border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'bg-[#0F1115] border-[#2A2D35] opacity-50 grayscale'}`}>
                                <div className="text-4xl mb-3">{ach.icon}</div>
                                <div className="text-white text-xs font-bold text-center mb-1">{ach.name}</div>
                                <div className="text-zinc-500 text-[9px] text-center">{ach.description}</div>
                                {ach.unlocked && <div className="text-emerald-500 text-[8px] uppercase tracking-widest font-black mt-2">Unlocked</div>}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 text-zinc-500 font-mono text-xs">NO ACHIEVEMENTS AVAILABLE</div>
                )}
            </div>

            <div>
                <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-4">
                    {monthOffset === 0 ? "History Log (This Month)" : `History Log (${getMonthName(monthOffset)})`}
                </h3>
                {(!stats?.history || stats.history.length === 0) ? (
                    <div className="text-center py-12 bg-[#1A1D24] border border-[#2A2D35] border-dashed rounded-2xl text-zinc-500 font-mono text-xs">
                        No drinks tallied in this period.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {stats.history.map(item => (
                            <motion.div
                                key={item.id}
                                layout
                                className="bg-[#15181E] border border-[#2A2D35] rounded-xl p-4 flex flex-col justify-between h-24 relative overflow-hidden group hover:border-[#3A3D45] transition-colors">
                                <div className="absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-2" style={{ backgroundColor: uiColors[item.color_name] || '#333' }}></div>
                                <div className="flex items-start justify-between pl-3">
                                    <div>
                                        <div className="font-medium text-white truncate max-w-[150px]">{item.drink_name}</div>
                                        <div className="text-zinc-500 font-mono text-[10px] mt-1">{item.color_name}</div>
                                    </div>
                                    <div className="flex flex-col items-end right">
                                        <span className="font-mono font-bold text-white">x{item.quantity}</span>
                                        <span className={item.paid_via_paypal ? "text-emerald-500 text-sm font-mono mt-0.5 line-through" : "text-amber-500 text-sm font-mono mt-0.5"}>
                                            €{(item.is_crate ? (item.price_paid ?? 0) : item.price).toFixed(2)}
                                        </span>
                                        {item.is_crate ? <span className="text-[8px] bg-amber-500/20 text-amber-400 mt-1 px-1.5 py-0.5 rounded-sm uppercase tracking-widest font-black">KASTEN</span> : null}
                                        {item.paid_via_paypal ? <span className="text-[8px] bg-emerald-500/20 text-emerald-400 mt-1 px-1.5 py-0.5 rounded-sm uppercase tracking-widest font-black">PAID (PAYPAL)</span> : null}
                                    </div>
                                </div>
                                <div className="text-zinc-600 font-mono text-[9px] text-right">
                                    {new Date(item.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
