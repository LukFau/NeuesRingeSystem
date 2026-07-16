import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import * as motion from 'motion/react-client';
import { AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastAction {
    label: string;
    onClick: () => void;
}

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    action?: ToastAction;
    duration?: number;
}

interface ToastContextType {
    success: (message: string, action?: ToastAction) => void;
    error: (message: string, action?: ToastAction) => void;
    warning: (message: string, action?: ToastAction) => void;
    info: (message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextType>({
    success: () => { },
    error: () => { },
    warning: () => { },
    info: () => { },
});

export const useToast = () => useContext(ToastContext);

const TOAST_ICONS: Record<ToastType, typeof CheckCircle> = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const TOAST_COLORS: Record<ToastType, { border: string; icon: string; bg: string }> = {
    success: { border: 'border-emerald-500/30', icon: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    error: { border: 'border-red-500/30', icon: 'text-red-500', bg: 'bg-red-500/10' },
    warning: { border: 'border-amber-500/30', icon: 'text-amber-500', bg: 'bg-amber-500/10' },
    info: { border: 'border-blue-500/30', icon: 'text-blue-500', bg: 'bg-blue-500/10' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
    const Icon = TOAST_ICONS[toast.type];
    const colors = TOAST_COLORS[toast.type];
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const duration = toast.duration ?? (toast.action ? 10000 : 4000);
        timerRef.current = setTimeout(() => onDismiss(toast.id), duration);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [toast.id, toast.duration, toast.action, onDismiss]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`flex items-start gap-3 bg-[#1A1D24] border ${colors.border} rounded-xl p-4 shadow-2xl shadow-black/40 min-w-[280px] max-w-[380px] backdrop-blur-md`}
        >
            <div className={`mt-0.5 p-1 rounded-lg ${colors.bg}`}>
                <Icon className={`w-4 h-4 ${colors.icon}`} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium leading-snug">{toast.message}</p>
                {toast.action && (
                    <button
                        onClick={() => {
                            toast.action!.onClick();
                            onDismiss(toast.id);
                        }}
                        className="mt-2 text-xs font-bold uppercase tracking-widest text-amber-500 hover:text-amber-400 transition-colors"
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                onClick={() => onDismiss(toast.id)}
                className="text-zinc-500 hover:text-white transition-colors mt-0.5 flex-shrink-0"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </motion.div>
    );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const idCounter = useRef(0);

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((type: ToastType, message: string, action?: ToastAction) => {
        const id = `toast-${++idCounter.current}-${Date.now()}`;
        setToasts(prev => [...prev.slice(-4), { id, type, message, action }]);
    }, []);

    const ctx: ToastContextType = {
        success: useCallback((msg, action) => addToast('success', msg, action), [addToast]),
        error: useCallback((msg, action) => addToast('error', msg, action), [addToast]),
        warning: useCallback((msg, action) => addToast('warning', msg, action), [addToast]),
        info: useCallback((msg, action) => addToast('info', msg, action), [addToast]),
    };

    useEffect(() => {
        const handleShowToast = (e: Event) => {
            const customEvent = e as CustomEvent<{ type: ToastType; message: string; action?: ToastAction }>;
            const { type, message, action } = customEvent.detail;
            addToast(type, message, action);
        };
        window.addEventListener('show-toast', handleShowToast);
        return () => window.removeEventListener('show-toast', handleShowToast);
    }, [addToast]);

    return (
        <ToastContext.Provider value={ctx}>
            {children}
            <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 items-end pointer-events-none">
                <AnimatePresence mode="popLayout">
                    {toasts.map(t => (
                        <div key={t.id} className="pointer-events-auto">
                            <ToastItem toast={t} onDismiss={dismiss} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}
