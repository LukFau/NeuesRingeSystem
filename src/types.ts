export interface User {
    id: number;
    username: string;
    role: 'user' | 'admin' | 'bierdax' | 'cb' | 'philister';
    avatar?: string;
}

export interface Drink {
    id: number;
    barcode: string;
    name: string;
    color_name: string;
    category: string;
    price: number; // resolved from colors
    stock: number;
    min_stock: number;
    critical_stock: number;
    bottles_per_crate: number;
    is_active: boolean;
    crate_price: number | null;
}

export interface Color {
    name: string;
    price: number;
}

export interface HistoryEvent {
    id: number;
    drink_name: string;
    color_name: string;
    price: number;
    date: string;
    quantity: number;
    paid_via_paypal?: number;
    is_crate?: boolean;
    price_paid?: number;
    responsible?: string;
}

export interface UserStats {
    colors: Record<string, number>;
    totalSpent: number;
    history: HistoryEvent[];
}

export interface AdminTally {
    username: string;
    colors: Record<string, number>;
    totalSpent: number;
}

export type ScanEvent = {
    type: 'known';
    id: number;
    barcode: string;
    name: string;
    color_name: string;
    price: number;
    stock: number;
    timestamp: string;
    scannerId?: string;
} | {
    type: 'unknown';
    barcode: string;
    timestamp: string;
    scannerId?: string;
};
