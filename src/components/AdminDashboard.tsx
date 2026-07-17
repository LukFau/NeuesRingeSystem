import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AuthContext } from '../App';
import * as motion from 'motion/react-client';
import { Drink, Color, AdminTally } from '../types';
import { useToast } from './Toast';
import { Download, AlertTriangle, Save, Trash2, Power, Search, Package, ChevronLeft, ChevronRight, BarChart as BarChartIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';

type AdminTab = 'tallies' | 'analytics' | 'inventory' | 'users' | 'achievements' | 'settings' | 'philister';

export default function AdminDashboard() {
    const { token, user } = useContext(AuthContext);
    const toast = useToast();
    const isBierdax = user?.role === 'bierdax';
    const [activeTab, setActiveTab] = useState<AdminTab>(isBierdax ? 'inventory' : 'tallies');
    const [adminTallies, setAdminTallies] = useState<{ booked: AdminTally[], paid: AdminTally[], totalBookedValue: number, totalPaidValue: number } | null>(null);
    const [drinks, setDrinks] = useState<Drink[]>([]);
    const [colors, setColors] = useState<Color[]>([]);

    const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
    const [draftStocks, setDraftStocks] = useState<Record<number, string>>({});
    const [draftMinStocks, setDraftMinStocks] = useState<Record<number, string>>({});
    const [draftCriticalStocks, setDraftCriticalStocks] = useState<Record<number, string>>({});
    const [draftDrinkColors, setDraftDrinkColors] = useState<Record<number, string>>({});
    const [draftDrinkCategory, setDraftDrinkCategory] = useState<Record<number, string>>({});
    const [draftCratePrices, setDraftCratePrices] = useState<Record<number, string>>({});
    const [newDrink, setNewDrink] = useState({ name: '', color_name: 'Rot', category: 'Softdrinks', stock: '', barcode: '', min_stock: '5', critical_stock: '2', bottles_per_crate: '20' });
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });

    const [users, setUsers] = useState<{ id: number, username: string, role: string, avatar?: string }[]>([]);
    const [passwords, setPasswords] = useState<Record<number, string>>({});
    const [achievements, setAchievements] = useState<any[]>([]);
    const [newAchievement, setNewAchievement] = useState({ name: '', description: '', icon: '🍺', condition_type: 'total_drinks', condition_value: '', condition_target: '' });
    const [settings, setSettings] = useState<any[]>([]);
    const [adminEmail, setAdminEmail] = useState('');
    const [paypalUsername, setPaypalUsername] = useState('');
    const [weroUsername, setWeroUsername] = useState('');
    const [smtpUser, setSmtpUser] = useState('');
    const [smtpPass, setSmtpPass] = useState('');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>('');

    const [loading, setLoading] = useState(true);
    const [drinkSearch, setDrinkSearch] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [consumptionLog, setConsumptionLog] = useState<any[]>([]);
    const [analyticsOffset, setAnalyticsOffset] = useState(0);

    const fetchTallies = async () => {
        try {
            const res = await fetch('/api/admin/tallies', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setAdminTallies(data);
        } catch (err) { }
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setUsers(data);
        } catch (err) { }
    };

    const fetchAchievements = async () => {
        try {
            const res = await fetch('/api/admin/achievements', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setAchievements(data);
        } catch (err) { }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setSettings(data);
            const emailSetting = data.find((s: any) => s.key === 'ADMIN_EMAIL');
            if (emailSetting) setAdminEmail(emailSetting.value);
            const paypalSetting = data.find((s: any) => s.key === 'PAYPAL_USERNAME');
            if (paypalSetting) setPaypalUsername(paypalSetting.value);
            const weroSetting = data.find((s: any) => s.key === 'WERO_USERNAME');
            if (weroSetting) setWeroUsername(weroSetting.value);
            const smtpUserSetting = data.find((s: any) => s.key === 'SMTP_USER');
            if (smtpUserSetting) setSmtpUser(smtpUserSetting.value);
            const smtpPassSetting = data.find((s: any) => s.key === 'SMTP_PASS');
            if (smtpPassSetting) setSmtpPass(smtpPassSetting.value);
        } catch (err) { }
    };

    const fetchDrinks = async () => {
        try {
            const res = await fetch('/api/drinks');
            const data = await res.json();
            setDrinks(data);
        } catch (err) { }
    };

    const fetchColors = async () => {
        try {
            const res = await fetch('/api/colors');
            const data = await res.json();
            setColors(data);
        } catch (err) { }
    };

    const fetchConsumptionLog = async (offset = 0) => {
        try {
            const res = await fetch(`/api/admin/consumption-log?offset=${offset}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setConsumptionLog(data);
        } catch (err) { }
    };

    useEffect(() => {
        fetchConsumptionLog(analyticsOffset);
    }, [analyticsOffset]);

    useEffect(() => {
        Promise.all([
            fetchTallies(),
            fetchDrinks(),
            fetchColors(),
            fetchUsers(),
            fetchAchievements(),
            fetchSettings(),
            fetchConsumptionLog()
        ]).finally(() => setLoading(false));

        const handleRefresh = () => {
            fetchTallies();
            fetchDrinks();
            fetchUsers();
            fetchAchievements();
            fetchSettings();
            fetchConsumptionLog();
        };
        window.addEventListener('refresh-tallies', handleRefresh);
        window.addEventListener('refresh-drinks', handleRefresh);
        return () => {
            window.removeEventListener('refresh-tallies', handleRefresh);
            window.removeEventListener('refresh-drinks', handleRefresh);
        };
    }, [token]);

    const changeUserPassword = async (userId: number) => {
        const newPassword = passwords[userId];
        if (!newPassword || newPassword.trim() === '') return;

        try {
            const res = await fetch(`/api/admin/users/${userId}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ newPassword: newPassword.trim() })
            });
            if (res.ok) {
                toast.success('Password updated successfully');
                setPasswords(prev => { const next = { ...prev }; delete next[userId]; return next; });
            } else {
                toast.error('Failed to update password');
            }
        } catch (err) {
            toast.error('Error updating password');
        }
    };

    const changeUserAvatar = async (userId: number, avatar: string) => {
        try {
            const res = await fetch(`/api/admin/users/${userId}/avatar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ avatar })
            });
            if (res.ok) {
                toast.success('Avatar updated successfully');
                fetchUsers();
            } else {
                toast.error('Failed to update avatar');
            }
        } catch (err) {
            toast.error('Error updating avatar');
        }
    };

    const createUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(newUser)
            });
            if (res.ok) {
                setNewUser({ username: '', password: '', role: 'user' });
                fetchUsers();
                toast.success(`User "${newUser.username}" created`);
            } else {
                const data = await res.json();
                toast.error(data.error || 'Failed to create user');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const deleteUser = async (id: number) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await fetch(`/api/admin/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchUsers();
        } catch (err) {
            console.error(err);
        }
    };

    const changeUserRole = async (userId: number, newRole: string) => {
        try {
            const res = await fetch(`/api/admin/users/${userId}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ role: newRole })
            });
            if (res.ok) {
                toast.success('User role updated successfully');
                fetchUsers();
            } else {
                const data = await res.json();
                toast.error(data.error || 'Failed to update user role');
            }
        } catch (err) {
            toast.error('Failed to update user role');
        }
    };

    const [debugReport, setDebugReport] = useState<string | null>(null);
    const [debugOffset, setDebugOffset] = useState<number>(0);

    const manualExport = async () => {
        try {
            await fetch('/api/admin/export', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            toast.success('Export emailed successfully!');
        } catch (err) {
            toast.error('Failed to send export.');
        }
    };

    const previewReport = async (offset: number) => {
        try {
            const res = await fetch(`/api/admin/debug/report?offset=${offset}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setDebugReport(data.report);
            setDebugOffset(offset);
        } catch (err) {
            toast.error('Failed to load debug report.');
        }
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
            setDraftPrices(prev => { const next = { ...prev }; delete next[name]; return next; });
            fetchColors();
            fetchTallies();
        } catch (err) {
            console.error(err);
        }
    };

    const updateDrink = async (id: number, newStock?: number, newColor?: string, newCategory?: string, newMinStock?: number, newCriticalStock?: number, newCratePrice?: number | null) => {
        const payload: any = {};
        if (newStock !== undefined && !isNaN(newStock) && newStock >= 0) payload.stock = newStock;
        if (newMinStock !== undefined && !isNaN(newMinStock) && newMinStock >= 0) payload.min_stock = newMinStock;
        if (newCriticalStock !== undefined && !isNaN(newCriticalStock) && newCriticalStock >= 0) payload.critical_stock = newCriticalStock;
        if (newColor !== undefined) payload.color_name = newColor;
        if (newCategory !== undefined) payload.category = newCategory;
        if (newCratePrice !== undefined) payload.crate_price = newCratePrice;

        if (Object.keys(payload).length === 0) return;

        try {
            await fetch(`/api/admin/drinks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            setDraftStocks(prev => { const next = { ...prev }; if (newStock !== undefined) delete next[id]; return next; });
            setDraftMinStocks(prev => { const next = { ...prev }; if (newMinStock !== undefined) delete next[id]; return next; });
            setDraftCriticalStocks(prev => { const next = { ...prev }; if (newCriticalStock !== undefined) delete next[id]; return next; });
            setDraftDrinkColors(prev => { const next = { ...prev }; if (newColor !== undefined) delete next[id]; return next; });
            setDraftDrinkCategory(prev => { const next = { ...prev }; if (newCategory !== undefined) delete next[id]; return next; });
            setDraftCratePrices(prev => { const next = { ...prev }; if (newCratePrice !== undefined) delete next[id]; return next; });
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
                    category: newDrink.category,
                    stock: parseInt(newDrink.stock, 10),
                    barcode: newDrink.barcode,
                    min_stock: parseInt(newDrink.min_stock, 10),
                    critical_stock: parseInt(newDrink.critical_stock, 10),
                    bottles_per_crate: parseInt(newDrink.bottles_per_crate, 10)
                })
            });
            if (res.ok) {
                setNewDrink({ name: '', color_name: 'Rot', category: 'Softdrinks', stock: '', barcode: '', min_stock: '5', critical_stock: '2', bottles_per_crate: '20' });
                fetchDrinks();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSave = async (key: string, value: string) => {
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ key, value })
            });
            if (res.ok) {
                toast.success(`${key.replace('_', ' ')} updated`);
                setEditingKey(null);
                fetchSettings();
            } else {
                toast.error('Failed to update setting');
            }
        } catch (err) {
            toast.error('Failed to update setting');
        }
    };

    const createAchievement = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/achievements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    ...newAchievement,
                    condition_value: parseInt(newAchievement.condition_value, 10)
                })
            });
            if (res.ok) {
                setNewAchievement({ name: '', description: '', icon: '🍺', condition_type: 'total_drinks', condition_value: '', condition_target: '' });
                fetchAchievements();
            }
        } catch (err) { }
    };

    const deleteAchievement = async (id: number) => {
        if (!confirm('Are you sure you want to delete this achievement?')) return;
        try {
            await fetch(`/api/admin/achievements/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchAchievements();
        } catch (err) { }
    };

    const [showAllUsers, setShowAllUsers] = useState(false);

    const colorChartData = useMemo(() => {
        return colors.map(c => ({
            name: c.name,
            count: consumptionLog.filter(log => log.color_name === c.name).reduce((sum, log) => sum + log.quantity, 0)
        }));
    }, [colors, consumptionLog]);

    const trendData = useMemo(() => {
        const trendByDate: Record<string, number> = {};
        consumptionLog.forEach(log => {
            const d = new Date(log.date).toISOString().split('T')[0];
            trendByDate[d] = (trendByDate[d] || 0) + log.quantity;
        });
        return Object.keys(trendByDate).sort().map(d => ({
            date: new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            count: trendByDate[d]
        }));
    }, [consumptionLog]);

    const timeData = useMemo(() => {
        const hourlyCounts = new Array(24).fill(0);
        consumptionLog.forEach(log => {
            const hour = new Date(log.date).getHours();
            hourlyCounts[hour] += log.quantity;
        });
        return hourlyCounts.map((count, hour) => ({
            time: `${hour.toString().padStart(2, '0')}:00`,
            count
        }));
    }, [consumptionLog]);

    if (loading) return <div className="text-center text-zinc-500 font-mono tracking-widest uppercase mt-20 text-xs">Loading datastore...</div>;

    const uiColors: Record<string, string> = {
        'Rot': '#ef4444',
        'Braun': '#78350f',
        'Grün': '#22c55e',
        'Schwarz': '#0f172a',
        'Blau': '#3b82f6'
    };

    const visibleUsers = showAllUsers ? users : users.slice(0, 5);
    const filteredDrinks = drinks.filter(d =>
        drinkSearch === '' ||
        d.name.toLowerCase().includes(drinkSearch.toLowerCase()) ||
        d.barcode.toLowerCase().includes(drinkSearch.toLowerCase())
    );
    const filteredUsers = users.filter(u =>
        userSearch === '' ||
        u.username.toLowerCase().includes(userSearch.toLowerCase())
    );


    const deleteConsumptionEntry = async (id: number) => {
        if (!confirm('Delete this consumption entry? Stock will be restored.')) return;
        try {
            const res = await fetch(`/api/tallies/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success('Entry deleted and stock restored');
                fetchConsumptionLog();
                fetchTallies();
                fetchDrinks();
            } else {
                const data = await res.json();
                toast.error(data.error || 'Failed to delete entry');
            }
        } catch (err) {
            toast.error('Failed to delete entry');
        }
    };

    const renderTallyTable = (tallies: AdminTally[], title: string) => {
        const safeTallies = Array.isArray(tallies) ? tallies : [];
        return (
            <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative">
                <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-6">{title}</h2>
                {safeTallies.length === 0 ? (
                    <div className="text-zinc-500 font-mono text-sm">No drinks consumed here yet.</div>
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
                                {safeTallies.map((t, i) => (
                                    <tr key={i} className="hover:bg-[#15181E] transition-colors">
                                        <td className="py-4 text-white font-medium">{t.username}</td>
                                        {colors.map(c => (
                                            <td key={c.name} className="py-4 text-center font-mono text-zinc-300">
                                                {t.colors[c.name] || '-'}
                                            </td>
                                        ))}
                                        <td className="py-4 text-right font-mono font-bold text-amber-500">€{(t.totalSpent || 0).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    const TABS: { key: AdminTab; label: string }[] = [
        { key: 'tallies', label: 'Tallies' },
        { key: 'analytics', label: 'Analytics' },
        { key: 'inventory', label: 'Inventory' },
        { key: 'users', label: 'Users' },
        { key: 'achievements', label: 'Achievements' },
        { key: 'settings', label: 'Settings' },
        { key: 'philister', label: 'Philister' },
    ];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Tab Navigation */}
            {!isBierdax && (
                <div className="flex bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-1.5 gap-1 overflow-x-auto">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${activeTab === tab.key
                                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                    : 'text-zinc-500 hover:text-white hover:bg-[#15181E]'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {/* ========== TALLIES TAB ========== */}
            {activeTab === 'tallies' && (
                <>
                    {adminTallies && !Array.isArray(adminTallies) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl">
                                <h3 className="text-amber-500 font-bold tracking-widest text-[10px] uppercase mb-2">Booked To Accounts (Unpaid)</h3>
                                <div className="text-4xl text-white font-bold font-mono">€{(adminTallies.totalBookedValue || 0).toFixed(2)}</div>
                            </div>
                            <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl">
                                <h3 className="text-emerald-500 font-bold tracking-widest text-[10px] uppercase mb-2">Paid Via PayPal/Wero</h3>
                                <div className="text-4xl text-white font-bold font-mono">€{(adminTallies.totalPaidValue || 0).toFixed(2)}</div>
                            </div>
                        </div>
                    )}

                    {adminTallies && !Array.isArray(adminTallies) && renderTallyTable(adminTallies.booked, "Consumption Record - Booked")}
                    {adminTallies && !Array.isArray(adminTallies) && renderTallyTable(adminTallies.paid, "Consumption Record - Paid (PayPal/Wero)")}
                    {adminTallies && Array.isArray(adminTallies) && renderTallyTable(adminTallies as unknown as AdminTally[], "Consumption Record")}

                    {/* Consumption Log with per-entry delete */}
                    <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative">
                        <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-6">Recent Activity (This Month)</h2>
                        {consumptionLog.length === 0 ? (
                            <div className="text-zinc-500 font-mono text-sm">No entries this month.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-zinc-400">
                                    <thead className="text-[10px] uppercase font-mono tracking-widest border-b border-[#2A2D35]">
                                        <tr>
                                            <th className="pb-3 font-medium text-zinc-500">User</th>
                                            <th className="pb-3 font-medium text-zinc-500">Drink</th>
                                            <th className="pb-3 font-medium text-zinc-500 text-center">Qty</th>
                                            <th className="pb-3 font-medium text-zinc-500 text-right">Price</th>
                                            <th className="pb-3 font-medium text-zinc-500 text-right">Date</th>
                                            <th className="pb-3 font-medium text-zinc-500 text-center">Paid</th>
                                            <th className="pb-3 font-medium text-zinc-500 text-center"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#2A2D35]">
                                        {consumptionLog.map((entry: any) => (
                                            <tr key={entry.id} className="hover:bg-[#15181E] transition-colors">
                                                <td className="py-3 text-white font-medium">{entry.username}</td>
                                                <td className="py-3 text-zinc-300">{entry.drink_name}</td>
                                                <td className="py-3 text-center font-mono text-zinc-300">x{entry.quantity} {entry.is_crate ? '(Kasten)' : ''}</td>
                                                <td className="py-3 text-right font-mono text-amber-500">€{(entry.is_crate ? Number(entry.price_paid || 0) : (Number(entry.price || 0) * entry.quantity)).toFixed(2)}</td>
                                                <td className="py-3 text-right text-zinc-500 text-xs font-mono">
                                                    {new Date(entry.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="py-3 text-center">
                                                    {entry.paid_via_paypal ? (
                                                        <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-sm uppercase tracking-widest font-black">Paid</span>
                                                    ) : (
                                                        <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-sm uppercase tracking-widest font-black">Booked</span>
                                                    )}
                                                </td>
                                                <td className="py-3 text-center">
                                                    <button
                                                        onClick={() => deleteConsumptionEntry(entry.id)}
                                                        className="p-1 text-zinc-600 hover:text-red-500 transition-colors"
                                                        title="Delete entry"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Debug & Export Section */}
                    <div className="mt-12 pt-8 border-t border-[#2A2D35]">
                        <h3 className="text-xs text-amber-500 font-bold uppercase tracking-widest mb-4">
                            System Admin & Debug
                        </h3>
                        <div className="flex flex-col md:flex-row gap-4 mb-4">
                            <button
                                id="export-btn"
                                onClick={manualExport}
                                className="w-full md:w-auto py-4 px-6 bg-[#0A0C0F] border border-[#2A2D35] rounded-lg text-zinc-400 text-xs font-bold uppercase hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                Email Current Month
                            </button>
                            <button
                                onClick={() => previewReport(0)}
                                className="w-full md:w-auto py-4 px-6 bg-[#0A0C0F] border border-[#2A2D35] rounded-lg text-zinc-400 text-xs font-bold uppercase hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                            >
                                <AlertTriangle className="w-4 h-4" />
                                Preview Current
                            </button>
                            <button
                                onClick={() => previewReport(-1)}
                                className="w-full md:w-auto py-4 px-6 bg-[#0A0C0F] border border-[#2A2D35] rounded-lg text-zinc-400 text-xs font-bold uppercase hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                            >
                                <AlertTriangle className="w-4 h-4" />
                                Preview Previous (-1)
                            </button>
                            <button
                                onClick={async () => {
                                    if (window.confirm('Are you absolutely sure you want to WIPE all consumption data? This is irreversible and should only be used after testing.')) {
                                        try {
                                            await fetch('/api/admin/debug/wipe', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                                            toast.warning('All consumption data has been wiped.');
                                            window.location.reload();
                                        } catch (err) {
                                            toast.error('Failed to wipe data.');
                                        }
                                    }
                                }}
                                className="w-full md:w-auto py-4 px-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs font-bold uppercase hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Wipe Test Data
                            </button>
                            <button
                                onClick={async () => {
                                    const password = window.prompt('WARNING: This will wipe ALL database records (consumption logs, drinks, achievements, and non-admin/guest users). Enter your Admin Password to confirm:');
                                    if (password === null) return;
                                    if (password.trim() === '') {
                                        toast.error('Password cannot be empty');
                                        return;
                                    }
                                    try {
                                        const res = await fetch('/api/admin/debug/wipe-all', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${token}`
                                            },
                                            body: JSON.stringify({ password })
                                        });
                                        const data = await res.json();
                                        if (res.ok) {
                                            toast.warning('System reset completed successfully.');
                                            window.location.reload();
                                        } else {
                                            toast.error(data.error || 'Failed to reset system');
                                        }
                                    } catch (err) {
                                        toast.error('Failed to communicate with server');
                                    }
                                }}
                                className="w-full md:w-auto py-4 px-6 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Reset System (Danger)
                            </button>
                        </div>
                        <p className="text-[10px] font-mono text-zinc-600">Note: The system dynamically filters data by date, so consumption from previous months is NOT included in the current month's report. There is no need to clear the database.</p>
                        {debugReport !== null && (
                            <div className="mt-6">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Generated Report Output (Offset: {debugOffset})</h4>
                                    <button onClick={() => setDebugReport(null)} className="text-zinc-500 text-xs font-mono uppercase hover:text-white">Close</button>
                                </div>
                                <pre className="bg-[#0A0C0F] border border-[#2A2D35] rounded-lg p-4 text-[10px] sm:text-xs text-white font-mono overflow-auto max-h-[400px]">
                                    {debugReport}
                                </pre>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ========== ANALYTICS TAB ========== */}
            {activeTab === 'analytics' && (
                <div className="space-y-6">
                    {/* Month Selector */}
                    <div className="flex items-center justify-between bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-4 shadow-xl">
                        <button
                            onClick={() => setAnalyticsOffset(prev => prev - 1)}
                            className="p-2 border border-[#2A2D35] hover:border-amber-500/50 hover:bg-[#15181E] text-zinc-400 hover:text-white rounded-xl transition flex items-center justify-center"
                            title="Previous Month"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="text-white font-bold tracking-widest text-xs uppercase font-mono">
                            {(() => {
                                const d = new Date();
                                d.setMonth(d.getMonth() + analyticsOffset);
                                return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                            })()}
                        </div>
                        <button
                            disabled={analyticsOffset >= 0}
                            onClick={() => setAnalyticsOffset(prev => prev + 1)}
                            className="p-2 border border-[#2A2D35] hover:border-amber-500/50 hover:bg-[#15181E] text-zinc-400 hover:text-white rounded-xl transition disabled:opacity-30 disabled:hover:border-[#2A2D35] disabled:hover:bg-transparent disabled:text-zinc-700 flex items-center justify-center"
                            title="Next Month"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-xl">
                            <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                                <BarChartIcon className="w-4 h-4 text-amber-500" /> Total Drinks by Color
                            </h3>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={colorChartData}>
                                        <XAxis dataKey="name" stroke="#52525b" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                                        <YAxis stroke="#52525b" tick={{ fill: '#a1a1aa', fontSize: 10 }} allowDecimals={false} />
                                        <Tooltip cursor={{ fill: '#2A2D35' }} contentStyle={{ backgroundColor: '#0F1115', border: '1px solid #2A2D35', color: '#fff' }} itemStyle={{ color: '#fff' }} />
                                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                            {colors.map((c, index) => (
                                                <Cell key={`cell-${index}`} fill={uiColors[c.name] || '#8b5cf6'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                            <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                                <BarChartIcon className="w-4 h-4 text-emerald-500" /> Consumption Trend
                            </h3>
                            <div className="h-64 w-full">
                                {(() => {
                                    return trendData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={trendData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#2A2D35" vertical={false} />
                                                <XAxis dataKey="date" stroke="#52525b" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                                                <YAxis stroke="#52525b" tick={{ fill: '#a1a1aa', fontSize: 10 }} allowDecimals={false} />
                                                <Tooltip contentStyle={{ backgroundColor: '#0F1115', border: '1px solid #2A2D35', color: '#fff' }} itemStyle={{ color: '#10b981' }} />
                                                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="text-center py-12 text-zinc-500 font-mono text-xs">NO TREND DATA</div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Time of Day Chart (Full Width) */}
                        <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-xl lg:col-span-2 relative overflow-hidden">
                            <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                                <BarChartIcon className="w-4 h-4 text-blue-500" /> Time of Day
                            </h3>
                            <div className="h-64 w-full">
                                {(() => {
                                    const hasData = timeData.some(d => d.count > 0);
                                    return hasData ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={timeData}>
                                                <XAxis dataKey="time" stroke="#52525b" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                                                <YAxis stroke="#52525b" tick={{ fill: '#a1a1aa', fontSize: 10 }} allowDecimals={false} />
                                                <Tooltip cursor={{ fill: '#2A2D35' }} contentStyle={{ backgroundColor: '#0F1115', border: '1px solid #2A2D35', color: '#fff' }} itemStyle={{ color: '#3b82f6' }} />
                                                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="text-center py-12 text-zinc-500 font-mono text-xs">NO TIME DATA</div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========== INVENTORY TAB ========== */}
            {activeTab === 'inventory' && (
                <>
                    {!isBierdax && (
                        <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative animate-fade-in">
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
                                                onChange={(e) => setDraftPrices({ ...draftPrices, [c.name]: e.target.value })}
                                                onBlur={() => updateColorPrice(c.name, draftPrices[c.name])}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                            <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black">Drink Inventory & Binding</h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Search drinks..."
                                    value={drinkSearch}
                                    onChange={e => setDrinkSearch(e.target.value)}
                                    className="pl-9 pr-4 py-2 bg-[#0F1115] border border-[#2A2D35] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500 w-full sm:w-56"
                                />
                            </div>
                        </div>
                        <div className="space-y-6">
                            {(() => {
                                const grouped = colors.map(c => ({
                                    ...c,
                                    drinks: filteredDrinks.filter(d => d.color_name === c.name)
                                }));
                                const unassigned = filteredDrinks.filter(d => !colors.some(c => c.name === d.color_name));
                                if (unassigned.length > 0) grouped.push({ name: 'Unassigned', price: 0, drinks: unassigned });

                                return grouped.map(group => group.drinks.length > 0 && (
                                    <div key={group.name} className="space-y-3">
                                        <h3 className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: uiColors[group.name] || '#333' }}></div>
                                            {group.name} <span className="text-zinc-600">({group.drinks.length})</span>
                                        </h3>
                                        {group.drinks.map(d => (
                                            <div key={d.id} className={`p-4 bg-[#0F1115] border border-[#2A2D35] rounded-2xl text-white border-l-4 transition-all ${!d.is_active ? 'opacity-50 grayscale' : 'hover:border-zinc-700'}`} style={{ borderLeftColor: uiColors[d.color_name] || '#333' }}>
                                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                                    {/* Left: Identity */}
                                                    <div className="flex items-start gap-3 min-w-[200px]">
                                                        {!!d.is_active && d.stock <= d.min_stock && (
                                                            <div className="mt-0.5">
                                                                <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-white text-base">{d.name}</span>
                                                                <span className="text-[9px] bg-zinc-800 border border-[#2A2D35] text-zinc-400 px-2 py-0.5 rounded font-mono uppercase tracking-wider">{d.category}</span>
                                                            </div>
                                                            <div className="text-[10px] text-zinc-500 font-mono mt-1">
                                                                Barcode: {d.barcode}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Center: Controls */}
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-zinc-500 uppercase text-[9px] font-bold tracking-wider">Color:</span>
                                                            <select
                                                                value={draftDrinkColors[d.id] ?? d.color_name}
                                                                onChange={(e) => setDraftDrinkColors({ ...draftDrinkColors, [d.id]: e.target.value })}
                                                                className="bg-[#1A1D24] border border-[#2A2D35] rounded-lg text-white py-1 px-2 outline-none focus:border-amber-500 text-xs"
                                                                disabled={!d.is_active}
                                                            >
                                                                {colors.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                            </select>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-zinc-500 uppercase text-[9px] font-bold tracking-wider">Stock:</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={draftStocks[d.id] ?? d.stock.toString()}
                                                                onChange={(e) => setDraftStocks({ ...draftStocks, [d.id]: e.target.value })}
                                                                className="w-16 bg-[#1A1D24] border border-[#2A2D35] rounded-lg text-white font-mono px-2 py-1 text-center outline-none focus:border-amber-500 text-xs"
                                                                disabled={!d.is_active}
                                                            />
                                                        </div>

                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-zinc-500 uppercase text-[9px] font-bold tracking-wider">Min:</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={draftMinStocks[d.id] ?? d.min_stock.toString()}
                                                                onChange={(e) => setDraftMinStocks({ ...draftMinStocks, [d.id]: e.target.value })}
                                                                className="w-12 bg-[#1A1D24] border border-[#2A2D35] rounded-lg text-white font-mono px-2 py-1 text-center outline-none focus:border-amber-500 text-xs"
                                                                disabled={!d.is_active}
                                                            />
                                                        </div>

                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-zinc-500 uppercase text-[9px] font-bold tracking-wider">Crit:</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={draftCriticalStocks[d.id] ?? (d.critical_stock !== undefined ? d.critical_stock.toString() : '2')}
                                                                onChange={(e) => setDraftCriticalStocks({ ...draftCriticalStocks, [d.id]: e.target.value })}
                                                                className="w-12 bg-[#1A1D24] border border-[#2A2D35] rounded-lg text-white font-mono px-2 py-1 text-center outline-none focus:border-amber-500 text-xs"
                                                                disabled={!d.is_active}
                                                            />
                                                        </div>

                                                        <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-lg px-2.5 py-1 text-[10px] text-zinc-400 font-mono" title="Configured bottles per crate">
                                                            {d.bottles_per_crate || 20} Fl./Kasten
                                                        </div>
                                                    </div>

                                                    {/* Right: Actions */}
                                                    <div className="flex items-center gap-2 self-end lg:self-center border-t lg:border-t-0 pt-3 lg:pt-0 border-[#2A2D35] w-full lg:w-auto justify-end">
                                                        <button
                                                            onClick={() => {
                                                                const stockStr = draftStocks[d.id];
                                                                const s = stockStr !== undefined ? parseInt(stockStr, 10) : undefined;
                                                                const minStr = draftMinStocks[d.id];
                                                                const ms = minStr !== undefined ? parseInt(minStr, 10) : undefined;
                                                                const critStr = draftCriticalStocks[d.id];
                                                                const cs = critStr !== undefined ? parseInt(critStr, 10) : undefined;
                                                                const c = draftDrinkColors[d.id];
                                                                updateDrink(d.id, s, c, undefined, ms, cs);
                                                            }}
                                                            disabled={!d.is_active}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1D24] border border-[#2A2D35] hover:border-amber-500 hover:text-amber-500 rounded-xl text-zinc-400 disabled:opacity-50 transition-colors text-xs font-semibold"
                                                            title="Save Changes"
                                                        >
                                                            <Save className="w-3.5 h-3.5" />
                                                            <span>Save</span>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                const bottles = d.bottles_per_crate || 20;
                                                                if (window.confirm(`Restock 1 crate (${bottles} bottles)?`)) {
                                                                    const currentStock = draftStocks[d.id] !== undefined ? parseInt(draftStocks[d.id]) : d.stock;
                                                                    const newStock = currentStock + bottles;
                                                                    setDraftStocks({ ...draftStocks, [d.id]: newStock.toString() });
                                                                    updateDrink(d.id, newStock, draftDrinkColors[d.id] ?? d.color_name, undefined, draftMinStocks[d.id] !== undefined ? parseInt(draftMinStocks[d.id]) : d.min_stock, draftCriticalStocks[d.id] !== undefined ? parseInt(draftCriticalStocks[d.id]) : d.critical_stock);
                                                                    toast.success(`Restocked 1 crate (${bottles} bottles)`);
                                                                }
                                                            }}
                                                            disabled={!d.is_active}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-500 disabled:opacity-50 rounded-xl transition-colors text-xs font-semibold"
                                                            title={`Restock 1 Crate (${d.bottles_per_crate || 20} bottles)`}
                                                        >
                                                            <Package className="w-3.5 h-3.5" />
                                                            <span>Restock</span>
                                                        </button>
                                                        <button
                                                            onClick={() => toggleDrinkStatus(d.id, d.is_active)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl transition-colors text-xs font-semibold ${d.is_active ? 'bg-[#1A1D24] border-[#2A2D35] hover:border-amber-500 hover:text-amber-500 text-zinc-400' : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'}`}
                                                            title={d.is_active ? 'Disable Drink' : 'Enable Drink'}
                                                        >
                                                            <Power className="w-3.5 h-3.5" />
                                                            <span>{d.is_active ? 'Disable' : 'Enable'}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => deleteDrink(d.id)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1D24] border border-[#2A2D35] hover:border-red-500 hover:text-red-500 rounded-xl text-zinc-400 transition-colors text-xs font-semibold"
                                                            title="Delete Drink"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            <span>Delete</span>
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
                            <form onSubmit={createDrink} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input type="text" placeholder="Drink Name" required value={newDrink.name} onChange={e => setNewDrink({ ...newDrink, name: e.target.value })} className="bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                                    <select value={newDrink.color_name} onChange={(e) => setNewDrink({ ...newDrink, color_name: e.target.value })} className="bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                                        {colors.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                    </select>
                                    <select value={newDrink.category} onChange={(e) => setNewDrink({ ...newDrink, category: e.target.value })} className="bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                                        <option value="Softdrinks">Softdrinks</option>
                                        <option value="Bier">Bier</option>
                                        <option value="Apfelwein">Apfelwein</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                                    <div>
                                        <label className="block text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Current Stock</label>
                                        <input type="number" placeholder="Stock" required min="0" value={newDrink.stock} onChange={e => setNewDrink({ ...newDrink, stock: e.target.value })} className="w-full bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Min Stock (Alert)</label>
                                        <input type="number" placeholder="Min Stock" required min="0" value={newDrink.min_stock} onChange={e => setNewDrink({ ...newDrink, min_stock: e.target.value })} className="w-full bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Critical Stock</label>
                                        <input type="number" placeholder="Critical Stock" required min="0" value={newDrink.critical_stock} onChange={e => setNewDrink({ ...newDrink, critical_stock: e.target.value })} className="w-full bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Bottles/Crate (Kasten)</label>
                                        <input type="number" placeholder="Bottles/Crate" required min="1" value={newDrink.bottles_per_crate} onChange={e => setNewDrink({ ...newDrink, bottles_per_crate: e.target.value })} className="w-full bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                                    </div>
                                    <div className="col-span-2 md:col-span-1">
                                        <label className="block text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Barcode (Optional)</label>
                                        <input type="text" placeholder="Barcode" value={newDrink.barcode} onChange={e => setNewDrink({ ...newDrink, barcode: e.target.value })} className="w-full bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 font-mono" />
                                    </div>
                                </div>
                                <button type="submit" className="w-full md:w-auto px-6 py-2.5 bg-amber-500 text-black font-bold uppercase text-xs rounded hover:bg-amber-400 self-start transition-colors">Add Drink</button>
                            </form>
                        </div>
                    </div>
                </>
            )}

            {/* ========== USERS TAB ========== */}
            {activeTab === 'users' && (
                <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                        <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black">User Management</h2>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                            <input
                                type="text"
                                placeholder="Search users..."
                                value={userSearch}
                                onChange={e => setUserSearch(e.target.value)}
                                className="pl-9 pr-4 py-2 bg-[#0F1115] border border-[#2A2D35] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500 w-full sm:w-56"
                            />
                        </div>
                    </div>
                    <div className="space-y-3">
                        {filteredUsers.map(u => (
                            <div key={u.id} className="flex flex-col md:flex-row md:justify-between md:items-center p-4 bg-[#0F1115] border border-[#2A2D35] rounded-lg text-white gap-3">
                                <div className="font-medium flex items-center gap-2">
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={u.avatar || ''}
                                            onChange={(e) => changeUserAvatar(u.id, e.target.value)}
                                            className="bg-[#1A1D24] border border-[#2A2D35] rounded-lg text-lg px-1 py-1 outline-none focus:border-amber-500 cursor-pointer"
                                            title="Change Avatar"
                                        >
                                            <option value="">-</option>
                                            {['🍺', '🍻', '🍷', '🥂', '🍹', '🍸', '🥃', '🍾', '🧊', '🧉', '🥛', '☕', '😎', '🤠', '👽', '👻', '🤡', '🦁', '🦊', '🐸'].map(e => (
                                                <option key={e} value={e}>{e}</option>
                                            ))}
                                        </select>
                                        {u.username}
                                    </div>
                                    {u.username !== 'admin' && u.username !== 'guest' && u.username !== 'Bierdax' && u.username !== 'CB' ? (
                                        <select
                                            value={u.role}
                                            onChange={(e) => changeUserRole(u.id, e.target.value)}
                                            className="bg-[#1A1D24] border border-[#2A2D35] rounded-full text-[10px] text-zinc-400 px-2 py-0.5 ml-2 uppercase font-bold tracking-widest outline-none focus:border-amber-500 cursor-pointer"
                                        >
                                            <option value="user">User</option>
                                            <option value="philister">Philister</option>
                                            <option value="bierdax">Bierdax</option>
                                        </select>
                                    ) : (
                                        <span className="text-[10px] bg-[#1A1D24] text-zinc-400 px-2 py-0.5 rounded-full ml-2 uppercase font-bold tracking-widest">{u.role}</span>
                                    )}
                                </div>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                    <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
                                        <input
                                            type="password"
                                            placeholder="New Password"
                                            value={passwords[u.id] || ''}
                                            onChange={(e) => setPasswords({ ...passwords, [u.id]: e.target.value })}
                                            className="w-full sm:w-40 bg-[#1A1D24] border border-[#2A2D35] rounded text-white px-3 py-1.5 outline-none focus:border-amber-500 placeholder-zinc-700"
                                        />
                                    </div>
                                    <button
                                        onClick={() => changeUserPassword(u.id)}
                                        disabled={!passwords[u.id] || passwords[u.id].trim() === ''}
                                        className="px-3 py-1.5 bg-[#1A1D24] border border-[#2A2D35] hover:border-amber-500 hover:text-amber-500 rounded text-zinc-500 disabled:opacity-30 disabled:hover:border-[#2A2D35] disabled:hover:text-zinc-500 text-xs uppercase tracking-widest font-bold font-mono transition-colors"
                                    >
                                        Update
                                    </button>
                                    {u.role !== 'admin' && (
                                        <button
                                            onClick={() => deleteUser(u.id)}
                                            className="p-1.5 bg-[#1A1D24] border border-[#2A2D35] hover:border-red-500 hover:text-red-500 rounded text-zinc-500 transition-colors"
                                            title="Delete User"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {filteredUsers.length > 5 && (
                            <button
                                onClick={() => setShowAllUsers(!showAllUsers)}
                                className="w-full mt-4 py-3 bg-[#0F1115] border border-[#2A2D35] hover:border-amber-500/50 rounded-lg text-zinc-400 hover:text-amber-500 text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                            >
                                {showAllUsers ? 'View Less' : `View All Users (${filteredUsers.length})`}
                            </button>
                        )}
                    </div>

                    <div className="mt-8 pt-6 border-t border-[#2A2D35]">
                        <h3 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-4">Add New User</h3>
                        <form onSubmit={createUser} className="flex flex-col sm:flex-row gap-3">
                            <input type="text" placeholder="Username" required value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} className="flex-1 bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                            <input type="password" placeholder="Password" required value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className="flex-1 bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="w-full sm:w-32 bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                                <option value="bierdax">Bierdax</option>
                                <option value="philister">Philister</option>
                            </select>
                            <button type="submit" className="bg-amber-500 text-black px-4 py-2 font-bold uppercase text-xs rounded hover:bg-amber-400">Add</button>
                        </form>
                    </div>
                </div>
            )}

            {/* ========== ACHIEVEMENTS TAB ========== */}
            {activeTab === 'achievements' && (
                <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative">
                    <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-6">Achievements Management</h2>
                    <div className="space-y-3 mb-8">
                        {achievements.map((ach: any) => (
                            <div key={ach.id} className="flex flex-col md:flex-row md:justify-between md:items-center p-4 bg-[#0F1115] border border-[#2A2D35] rounded-lg text-white gap-3">
                                <div className="flex items-center gap-4">
                                    <div className="text-2xl">{ach.icon}</div>
                                    <div>
                                        <div className="font-medium text-white">{ach.name}</div>
                                        <div className="text-[10px] text-zinc-500">{ach.description}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-amber-500 font-mono text-xs uppercase bg-amber-500/10 px-2 py-1 rounded">
                                        {ach.condition_type}
                                        {ach.condition_target && ` (${ach.condition_target})`}
                                        {' '} &ge; {ach.condition_value}
                                    </span>
                                    <button
                                        onClick={() => deleteAchievement(ach.id)}
                                        className="p-1.5 bg-[#1A1D24] border border-[#2A2D35] hover:border-red-500 hover:text-red-500 rounded text-zinc-500 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-6 border-t border-[#2A2D35]">
                        <h3 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-4">Add New Achievement</h3>
                        <form onSubmit={createAchievement} className="flex flex-col gap-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <input type="text" placeholder="Name (e.g. Total Pro)" required value={newAchievement.name} onChange={e => setNewAchievement({ ...newAchievement, name: e.target.value })} className="bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                                <input type="text" placeholder="Icon/Emoji (e.g. 🏆)" required value={newAchievement.icon} onChange={e => setNewAchievement({ ...newAchievement, icon: e.target.value })} className="bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                            </div>
                            <input type="text" placeholder="Description" required value={newAchievement.description} onChange={e => setNewAchievement({ ...newAchievement, description: e.target.value })} className="bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <select value={newAchievement.condition_type} onChange={e => setNewAchievement({ ...newAchievement, condition_type: e.target.value, condition_target: '' })} className="bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                                    <option value="total_drinks">Total Drinks</option>
                                    <option value="total_spent">Total Spent</option>
                                    <option value="color_drinks">By Color</option>
                                    <option value="specific_drink">Specific Drink</option>
                                </select>
                                {(newAchievement.condition_type === 'color_drinks' || newAchievement.condition_type === 'specific_drink') && (
                                    <select value={newAchievement.condition_target} onChange={e => setNewAchievement({ ...newAchievement, condition_target: e.target.value })} className="bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" required>
                                        <option value="" disabled>Select Target...</option>
                                        {newAchievement.condition_type === 'color_drinks' && colors.map(c => (
                                            <option key={c.name} value={c.name}>{c.name}</option>
                                        ))}
                                        {newAchievement.condition_type === 'specific_drink' && drinks.map(d => (
                                            <option key={d.id} value={d.name}>{d.name}</option>
                                        ))}
                                    </select>
                                )}
                                <input type="number" placeholder="Condition Value" required value={newAchievement.condition_value} onChange={e => setNewAchievement({ ...newAchievement, condition_value: e.target.value })} className="bg-[#0F1115] border border-[#2A2D35] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 font-mono" />
                            </div>
                            <button type="submit" className="mt-2 bg-amber-500 text-black px-4 py-2 font-bold uppercase text-xs rounded hover:bg-amber-400 self-start">
                                Add Achievement
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ========== SETTINGS TAB ========== */}
            {activeTab === 'settings' && (
                <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative">
                    <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-6">Settings</h2>
                    {(() => {
                        const SETTINGS_METADATA = [
                            { key: 'ADMIN_EMAIL', label: 'Admin/Report Email', value: adminEmail, placeholder: 'admin@example.com', description: 'Receiver of automated reports', isPassword: false },
                            { key: 'PAYPAL_USERNAME', label: 'PayPal Username', value: paypalUsername, placeholder: 'my-paypal-user', description: 'Used for generating PayPal.Me payment links', isPassword: false },
                            { key: 'WERO_USERNAME', label: 'Wero Phone Number / ID', value: weroUsername, placeholder: '+4915123456789', description: 'Used for mobile Wero payments', isPassword: false },
                            { key: 'SMTP_USER', label: 'SMTP Email (Gmail)', value: smtpUser, placeholder: 'your.email@gmail.com', description: 'Sender address for automated reports', isPassword: false },
                            { key: 'SMTP_PASS', label: 'SMTP App Password', value: smtpPass, placeholder: '16-character App Password', description: 'For Gmail: Requires 2-Step Verification. Go to your Google Account Security > App passwords to generate.', isPassword: true }
                        ];

                        return (
                            <div className="space-y-6">
                                {SETTINGS_METADATA.map(setting => {
                                    const isEditing = editingKey === setting.key;
                                    return (
                                        <div key={setting.key} className="p-4 bg-[#0F1115] border border-[#2A2D35] rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="font-bold text-white text-xs uppercase tracking-wider mb-1">{setting.label}</div>
                                                <div className="text-[10px] text-zinc-500 mb-2 leading-relaxed">{setting.description}</div>
                                                {isEditing ? (
                                                    <input
                                                        type={setting.isPassword ? 'password' : 'text'}
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        placeholder={setting.placeholder}
                                                        className="w-full md:max-w-md bg-[#1A1D24] border border-[#2A2D35] rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-amber-500"
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <div className="text-sm font-mono font-medium text-amber-500 bg-amber-500/5 border border-amber-500/10 rounded px-3 py-1.5 inline-block truncate max-w-full">
                                                        {setting.value ? (setting.isPassword ? '••••••••••••••••' : setting.value) : <span className="text-zinc-600 italic">Not set</span>}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 self-end md:self-center">
                                                {isEditing ? (
                                                    <>
                                                        <button
                                                            onClick={async () => {
                                                                if (setting.key === 'ADMIN_EMAIL') setAdminEmail(editValue);
                                                                else if (setting.key === 'PAYPAL_USERNAME') setPaypalUsername(editValue);
                                                                else if (setting.key === 'WERO_USERNAME') setWeroUsername(editValue);
                                                                else if (setting.key === 'SMTP_USER') setSmtpUser(editValue);
                                                                else if (setting.key === 'SMTP_PASS') setSmtpPass(editValue);
                                                                await handleSave(setting.key, editValue);
                                                            }}
                                                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold uppercase rounded-lg transition-colors"
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingKey(null)}
                                                            className="px-4 py-2 bg-[#1A1D24] border border-[#2A2D35] hover:bg-zinc-800 text-zinc-400 text-xs font-bold uppercase rounded-lg transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            setEditingKey(setting.key);
                                                            setEditValue(setting.value || '');
                                                        }}
                                                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase rounded-lg transition-colors"
                                                    >
                                                        Change
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ========== PHILISTER TAB ========== */}
            {activeTab === 'philister' && (
                <div className="bg-[#1A1D24] border border-[#2A2D35] rounded-2xl p-6 shadow-2xl relative animate-fade-in">
                    <h2 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-1">Philister Crate Pricing</h2>
                    <p className="text-xs text-zinc-400 mb-6">
                        Set Kasten (crate) prices for drinks. Once set, these are available for Philister users to buy as crates. Beer and Apfelwein default to €15.00. Clear the price to disable crate booking for that drink.
                    </p>

                    <div className="relative mb-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search drinks..."
                            value={drinkSearch}
                            onChange={e => setDrinkSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-[#0F1115] border border-[#2A2D35] rounded-lg text-white text-xs focus:outline-none focus:border-amber-500 w-full sm:w-56"
                        />
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[#2A2D35] text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                                    <th className="pb-3">Drink Name</th>
                                    <th className="pb-3 text-center">Category</th>
                                    <th className="pb-3 text-center">Stock</th>
                                    <th className="pb-3 text-center">Bottle Price</th>
                                    <th className="pb-3 text-right">Kasten Price</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#2A2D35]">
                                {drinks.filter(d => d.is_active && (d.name.toLowerCase().includes(drinkSearch.toLowerCase()) || d.category.toLowerCase().includes(drinkSearch.toLowerCase()))).map(d => (
                                    <tr key={d.id} className="hover:bg-[#15181E] transition-colors">
                                        <td className="py-4 text-white font-medium">{d.name}</td>
                                        <td className="py-4 text-center font-mono text-xs text-zinc-400">
                                            <span className="bg-[#0F1115] border border-[#2A2D35] px-2 py-0.5 rounded-full">{d.category}</span>
                                        </td>
                                        <td className="py-4 text-center font-mono text-zinc-300">
                                            {d.stock} bottles <span className="text-zinc-600">({Math.floor(d.stock / d.bottles_per_crate)} crates)</span>
                                        </td>
                                        <td className="py-4 text-center font-mono text-zinc-400">
                                            €{(d.price || 0).toFixed(2)}
                                        </td>
                                        <td className="py-4 text-right">
                                            <div className="flex items-center gap-1.5 justify-end">
                                                <span className="text-zinc-500 text-xs font-mono">€</span>
                                                <input
                                                    type="text"
                                                    placeholder="No crate price"
                                                    className="w-24 bg-[#0F1115] border border-[#2A2D35] rounded text-white font-mono text-center px-2 py-1 text-sm focus:border-amber-500 outline-none"
                                                    value={draftCratePrices[d.id] ?? (d.crate_price !== null ? d.crate_price.toString() : '')}
                                                    onChange={(e) => setDraftCratePrices({ ...draftCratePrices, [d.id]: e.target.value })}
                                                    onBlur={() => {
                                                        const val = draftCratePrices[d.id];
                                                        if (val === undefined) return;
                                                        if (val.trim() === '') {
                                                            updateDrink(d.id, undefined, undefined, undefined, undefined, undefined, null);
                                                            toast.success(`Removed crate price for ${d.name}`);
                                                        } else {
                                                            const num = parseFloat(val.replace(',', '.'));
                                                            if (!isNaN(num) && num >= 0) {
                                                                updateDrink(d.id, undefined, undefined, undefined, undefined, undefined, num);
                                                                toast.success(`Updated crate price for ${d.name} to €${num.toFixed(2)}`);
                                                            } else {
                                                                toast.error('Invalid price entered');
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </motion.div>
    );
}

