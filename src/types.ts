export interface User {
    id: number;
    username: string;
    role: 'user' | 'admin';
}

export interface Drink {
    id: number;
    barcode: string;
    name: string;
    color_name: string;
    price: number; // resolved from colors
    stock: number;
    min_stock: number;
    is_active: boolean;
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
    timestamp: string;
} | {
    type: 'unknown';
    barcode: string;
    timestamp: string;
};
