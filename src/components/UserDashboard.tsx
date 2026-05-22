import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import * as motion from 'motion/react-client';
import { UserStats } from '../types';
import { Beer, Heart, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from 'recharts';

export default function UserDashboard({ clearScan }: { clearScan: () => void }) {
    const { token } = useContext(AuthContext);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchTallies = async () => {
        try {
            const res = await fetch('/api/tallies/me', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setStats(data);
        } catch (err) {}
    };

    useEffect(() => {
        fetchTallies().finally(() => setLoading(false));
        const handleRefresh = () => fetchTallies();
        window.addEventListener('refresh-tallies', handleRefresh);
        return () => window.removeEventListener('refresh-tallies', handleRefresh);
    }, [token]);

    if (loading) return <div className="text-center text-zinc-500 font-mono tracking-widest uppercase mt-20 text-xs">Loading datastore...</div>;

    const uiColors: Record<string, string> = {
        'Rot': '#ef4444',
        'Braun': '#78350f',
        'Grün': '#22c55e',
        'Schwarz': '#0f172a',
        'Blau': '#3b82f6'
    };

    const chartData = stats ? Object.keys(stats.colors).map(cName => ({
        name: cName,
        count: stats.colors[cName]
    })) : [];

    // Favorite drinks
    const drinkCounts: Record<string, number> = {};
    if (stats?.history) {
        stats.history.forEach(log => {
            drinkCounts[log.drink_name] = (drinkCounts[log.drink_name] || 0) + log.quantity;
        });
    }
    const favoriteDrinks = Object.entries(drinkCounts)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 3);

    // Trend Data
    const trendByDate: Record<string, number> = {};
    if (stats?.history) {
        stats.history.forEach(log => {
            const d = new Date(log.date).toISOString().split('T')[0];
            trendByDate[d] = (trendByDate[d] || 0) + log.quantity;
        });
    }
    const trendChartData = Object.keys(trendByDate).sort().map(d => ({
        date: new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        count: trendByDate[d]
    }));

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 md:p-8 flex items-center justify-between shadow-2xl relative">
                    <div>
                        <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-2">Total Monthly Due</h2>
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
                                    <XAxis dataKey="name" stroke="#52525b" tick={{fill: '#a1a1aa'}} />
                                    <YAxis stroke="#52525b" tick={{fill: '#a1a1aa'}} allowDecimals={false} />
                                    <Tooltip cursor={{fill: '#2A2D35'}} contentStyle={{backgroundColor: '#0F1115', border: '1px solid #2A2D35', color: '#fff'}} />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={uiColors[entry.name] || '#8b5cf6'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-zinc-500 font-mono text-xs">NO DATA THIS MONTH</div>
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
                                    <XAxis dataKey="date" stroke="#52525b" tick={{fill: '#a1a1aa', fontSize: 10}} tickMargin={10} minTickGap={20} />
                                    <YAxis stroke="#52525b" tick={{fill: '#a1a1aa', fontSize: 10}} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{backgroundColor: '#0F1115', border: '1px solid #2A2D35', color: '#fff'}}
                                        itemStyle={{color: '#10b981'}}
                                        labelStyle={{color: '#a1a1aa', fontSize: '12px', marginBottom: '4px'}}
                                    />
                                    <Line type="monotone" dataKey="count" name="Drinks" stroke="#10b981" strokeWidth={3} dot={{ fill: '#0F1115', stroke: '#10b981', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: '#10b981', stroke: '#0F1115' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-zinc-500 font-mono text-xs">NO DATA THIS MONTH</div>
                    )}
                </div>
            </div>

            <div>
                <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-4">
                    History Log (This Month)
                </h3>
                {(!stats?.history || stats.history.length === 0) ? (
                    <div className="text-center py-12 bg-[#1A1D24] border border-[#2A2D35] border-dashed rounded-2xl text-zinc-500">
                        No drinks tallied yet. Scan a drink to begin!
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
                                        <span className="text-amber-500 text-sm font-mono mt-0.5">€{item.price.toFixed(2)}</span>
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
