import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import * as motion from 'motion/react-client';
import { Drink, Color, AdminTally } from '../types';
import { Download, AlertTriangle, Save, Trash2, Power } from 'lucide-react';

export default function AdminDashboard() {
    const { token } = useContext(AuthContext);
    const [adminTallies, setAdminTallies] = useState<AdminTally[]>([]);
    const [drinks, setDrinks] = useState<Drink[]>([]);
    const [colors, setColors] = useState<Color[]>([]);

    const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
    const [draftStocks, setDraftStocks] = useState<Record<number, string>>({});
    const [draftDrinkColors, setDraftDrinkColors] = useState<Record<number, string>>({});
    const [newDrink, setNewDrink] = useState({ name: '', color_name: 'Rot', stock: '', barcode: '' });

    const [loading, setLoading] = useState(true);

    const fetchTallies = async () => {
        try {
            const res = await fetch('/api/admin/tallies', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setAdminTallies(data);
        } catch (err) {}
    };

    const fetchDrinks = async () => {
        try {
            const res = await fetch('/api/drinks');
            const data = await res.json();
            setDrinks(data);
        } catch (err) {}
    };

    const fetchColors = async () => {
        try {
            const res = await fetch('/api/colors');
            const data = await res.json();
            setColors(data);
        } catch (err) {}
    };

    useEffect(() => {
        Promise.all([fetchTallies(), fetchDrinks(), fetchColors()]).finally(() => setLoading(false));

        const handleRefresh = () => { fetchTallies(); fetchDrinks(); };
        window.addEventListener('refresh-tallies', handleRefresh);
        window.addEventListener('refresh-drinks', handleRefresh);
        return () => {
            window.removeEventListener('refresh-tallies', handleRefresh);
            window.removeEventListener('refresh-drinks', handleRefresh);
        };
    }, [token]);

    const manualExport = async () => {
        const btn = document.getElementById('export-btn');
        if (btn) btn.innerText = 'Sending...';
        try {
            await fetch('/api/admin/export', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            alert('Export emailed successfully!');
        } catch (err) {
            alert('Failed to send export.');
        }
        if (btn) btn.innerText = 'Trigger Report Export';
    };

    const updateColorPrice = async (name: string, priceStr?: string) => {
        if (!priceStr) return;
        const price = parseFloat(priceStr.replace(',', '.'));
        if (isNaN(price) || price < 0) return;

        try {
            await fetch(`/api/admin/colors/${name}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ price })
            });
            setDraftPrices(prev => { const next = {...prev}; delete next[name]; return next; });
            fetchColors();
            fetchTallies();
        } catch (err) {
            console.error(err);
        }
    };

    const updateDrink = async (id: number, newStock?: number, newColor?: string) => {
        const payload: any = {};
        if (newStock !== undefined && !isNaN(newStock) && newStock >= 0) payload.stock = newStock;
        if (newColor !== undefined) payload.color_name = newColor;

        if (Object.keys(payload).length === 0) return;

        try {
            await fetch(`/api/admin/drinks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            setDraftStocks(prev => { const next = {...prev}; if(newStock !== undefined) delete next[id]; return next; });
            setDraftDrinkColors(prev => { const next = {...prev}; if(newColor !== undefined) delete next[id]; return next; });
            fetchDrinks();
        } catch (err) {
            console.error(err);
        }
    };

    const toggleDrinkStatus = async (id: number, currentStatus: boolean) => {
        // If it's currently active, ask for confirmation before deactivating
        if (currentStatus && !confirm('Are you sure you want to deactivate this drink?')) return;
        try {
            await fetch(`/api/admin/drinks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ is_active: !currentStatus })
            });
            fetchDrinks();
        } catch (err) {
            console.error(err);
        }
    };

    const deleteDrink = async (id: number) => {
        if (!confirm('Are you sure you want to delete this drink? This action cannot be undone.')) return;
        try {
            await fetch(`/api/admin/drinks/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchDrinks();
        } catch (err) {
            console.error(err);
        }
    };

    const createDrink = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/drinks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    name: newDrink.name,
                    color_name: newDrink.color_name,
                    stock: parseInt(newDrink.stock, 10),
                    barcode: newDrink.barcode
                })
            });
            if (res.ok) {
                setNewDrink({ name: '', color_name: 'Rot', stock: '', barcode: '' });
                fetchDrinks();
            }
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) return <div className="text-center text-zinc-500 font-mono tracking-widest uppercase mt-20 text-xs">Loading datastore...</div>;

    const uiColors: Record<string, string> = {
        'Rot': '#ef4444',
        'Braun': '#78350f',
        'Grün': '#22c55e',
        'Schwarz': '#0f172a',
        'Blau': '#3b82f6'
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative">
                <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-6">Color Price Management</h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    {colors.map(c => (
                        <div key={c.name} className="bg-[#0F1115] border border-[#2A2D35] rounded-lg p-3 text-center border-t-2" style={{ borderTopColor: uiColors[c.name] || '#333' }}>
                            <div className="font-medium text-white mb-2">{c.name}</div>
                            <div className="flex items-center justify-center gap-1">
                                <span className="text-zinc-500 text-xs">€</span>
                                <input
                                    type="text"
                                    className="w-16 bg-[#1A1D24] border border-[#2A2D35] rounded text-white font-mono text-center px-1 py-1 text-sm focus:border-amber-500 outline-none"
                                    value={draftPrices[c.name] ?? c.price.toFixed(2)}
                                    onChange={(e) => setDraftPrices({...draftPrices, [c.name]: e.target.value})}
                                    onBlur={() => updateColorPrice(c.name, draftPrices[c.name])}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative">
                <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-6">Global Consumption Record</h2>
                {adminTallies.length === 0 ? (
                    <div className="text-zinc-500 font-mono text-sm">No drinks consumed yet this month.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-zinc-400">
                            <thead className="text-[10px] uppercase font-mono tracking-widest border-b border-[#2A2D35]">
                            <tr>
                                <th className="pb-3 font-medium text-zinc-500">User</th>
                                {colors.map(c => (
                                    <th key={c.name} className="pb-3 font-medium text-zinc-500 text-center">{c.name}</th>
                                ))}
                                <th className="pb-3 font-medium text-zinc-500 text-right">Total</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-[#2A2D35]">
                            {adminTallies.map((t, i) => (
                                <tr key={i} className="hover:bg-[#15181E] transition-colors">
                                    <td className="py-4 text-white font-medium">{t.username}</td>
                                    {colors.map(c => (
                                        <td key={c.name} className="py-4 text-center font-mono text-zinc-300">
                                            {t.colors[c.name] || '-'}
                                        </td>
                                    ))}
                                    <td className="py-4 text-right font-mono font-bold text-amber-500">€{t.totalSpent.toFixed(2)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative">
                <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-6">Drink Inventory & Binding</h2>
                <div className="space-y-6">
                    {(() => {
                        const grouped = colors.map(c => ({
                            ...c,
                            drinks: drinks.filter(d => d.color_name === c.name)
                        }));
                        const unassigned = drinks.filter(d => !colors.some(c => c.name === d.color_name));
                        if (unassigned.length > 0) grouped.push({ name: 'Unassigned', price: 0, drinks: unassigned });

                        return grouped.map(group => group.drinks.length > 0 && (
                            <div key={group.name} className="space-y-3">
                                <h3 className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: uiColors[group.name] || '#333' }}></div>
                                    {group.name} <span className="text-zinc-600">({group.drinks.length})</span>
                                </h3>
                                {group.drinks.map(d => (
                                    <div key={d.id} className={`flex flex-col md:flex-row md:justify-between md:items-center p-4 bg-[#0F1115] border border-[#2A2D35] rounded-lg text-white gap-3 border-l-4 ${!d.is_active ? 'opacity-50 grayscale' : ''}`} style={{borderLeftColor: uiColors[d.color_name] || '#333'}}>
                                        <div className="font-medium flex items-center gap-2">
                                            {!!d.is_active && d.stock <= d.min_stock && <AlertTriangle className="w-4 h-4 text-red-500" />}
                                            {d.name} <span className="text-zinc-500 font-mono text-xs ml-2">({d.barcode})</span>
                                            {!d.is_active && <span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full ml-2 uppercase font-bold tracking-widest">Inactive</span>}
                                        </div>
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="text-zinc-500 uppercase">Color:</span>
                                                <select
                                                    value={draftDrinkColors[d.id] ?? d.color_name}
                                                    onChange={(e) => setDraftDrinkColors({...draftDrinkColors, [d.id]: e.target.value})}
                                                    className="bg-[#1A1D24] border border-[#2A2D35] rounded text-white py-1.5 px-2 outline-none"
                                                    disabled={!d.is_active}
                                                >
                                                    {colors.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="text-zinc-500 uppercase">Stock:</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={draftStocks[d.id] ?? d.stock.toString()}
                                                    onChange={(e) => setDraftStocks({...draftStocks, [d.id]: e.target.value})}
                                                    className="w-16 bg-[#1A1D24] border border-[#2A2D35] rounded text-white font-mono px-2 py-1.5 text-right outline-none focus:border-amber-500"
                                                    disabled={!d.is_active}
                                                />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => {
                                                        const stockStr = draftStocks[d.id];
                                                        const s = stockStr !== undefined ? parseInt(stockStr, 10) : undefined;
                                                        const c = draftDrinkColors[d.id];
                                                        updateDrink(d.id, s, c);
                                                    }}
                                                    disabled={!d.is_active}
                                                    className="p-1.5 bg-[#1A1D24] border border-[#2A2D35] hover:border-amber-500 hover:text-amber-500 rounded text-zinc-500 disabled:opacity-50"
                                                    title="Save Changes"
                                                >
                                                    <Save className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => toggleDrinkStatus(d.id, d.is_active)}
                                                    className="p-1.5 bg-[#1A1D24] border border-[#2A2D35] hover:border-amber-500 hover:text-amber-500 rounded text-zinc-500"
                                                    title={d.is_active ? 'Disable Drink' : 'Enable Drink'}
                                                >
                                                    <Power className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => deleteDrink(d.id)}
                                                    className="p-1.5 bg-[#1A1D24] border border-[#2A2D35] hover:border-red-500 hover:text-red-500 rounded text-zinc-500"
                                                    title="Delete Drink"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ));
                    })()}
                </div>

                <div className="mt-8 pt-6 border-t border-[#2A2D35]">
                    <h3 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-4">Add New Drink</h3>
                    <form onSubmit={createDrink} className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            placeholder="Drink Name"
                            required
                            value={newDrink.name}
                            onChange={e => setNewDrink({...newDrink, name: e.target.value})}
                            className="flex-1 bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                        />
                        <select
                            value={newDrink.color_name}
                            onChange={(e) => setNewDrink({...newDrink, color_name: e.target.value})}
                            className="w-full sm:w-32 bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                        >
                            {colors.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                        <input
                            type="number"
                            placeholder="Stock"
                            required
                            min="0"
                            value={newDrink.stock}
                            onChange={e => setNewDrink({...newDrink, stock: e.target.value})}
                            className="w-full sm:w-24 bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                        />
                        <input
                            type="text"
                            placeholder="Barcode (Opt)"
                            value={newDrink.barcode}
                            onChange={e => setNewDrink({...newDrink, barcode: e.target.value})}
                            className="w-full sm:w-32 bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 font-mono"
                        />
                        <button type="submit" className="bg-amber-500 text-black px-4 py-2 font-bold uppercase text-xs rounded hover:bg-amber-400">
                            Add
                        </button>
                    </form>
                </div>
            </div>

            <div className="mt-12 pt-8 border-t border-[#2A2D35]">
                <h3 className="text-xs text-amber-500 font-bold uppercase tracking-widest mb-4">
                    System Admin
                </h3>
                <button
                    id="export-btn"
                    onClick={manualExport}
                    className="w-full md:w-auto py-4 px-6 bg-[#0A0C0F] border border-[#2A2D35] rounded-lg text-zinc-400 text-xs font-bold uppercase hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                >
                    <Download className="w-4 h-4" />
                    Trigger Report Export
                </button>
                <p className="text-[10px] font-mono text-zinc-600 mt-3">Executes immediate email report for the current month.</p>
            </div>
        </motion.div>
    );
}
