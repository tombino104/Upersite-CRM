import { useState, useEffect, useCallback, useRef } from 'react';
import { loadData, saveData, syncWithFileSystem, defaultData } from '../utils/storage';

export function useCustomers() {
    const [customers, setCustomers] = useState([]);
    const [tags, setTags] = useState(defaultData.tags || []);
    const [settings, setSettings] = useState(defaultData.settings);
    const [hasSynced, setHasSynced] = useState(false);

    useEffect(() => {
        async function init() {
            const data = await syncWithFileSystem();
            setCustomers(data.customers || []);
            setTags(data.tags || defaultData.tags || []);
            setSettings(data.settings || defaultData.settings);
            setHasSynced(true);
        }
        init();
    }, []);

    const persist = useCallback((updatedCustomers, updatedSettings, updatedTags) => {
        const data = loadData();
        if (updatedCustomers !== undefined) {
            setCustomers(updatedCustomers);
            data.customers = updatedCustomers;
        }
        if (updatedSettings !== undefined) {
            setSettings(updatedSettings);
            data.settings = updatedSettings;
        }
        if (updatedTags !== undefined) {
            setTags(updatedTags);
            data.tags = updatedTags;
        }
        saveData(data);
    }, []);

    const addCustomer = useCallback((customer) => {
        persist([...customers, customer]);
    }, [customers, persist]);

    const updateCustomer = useCallback((id, updates) => {
        persist(customers.map(c => c.id === id ? { ...c, ...updates } : c));
    }, [customers, persist]);

    const deleteCustomer = useCallback((id) => {
        persist(customers.filter(c => c.id !== id));
    }, [customers, persist]);

    const updateSettings = useCallback((newSettings) => {
        persist(undefined, { ...settings, ...newSettings }, undefined);
    }, [settings, persist]);

    const updateTags = useCallback((newTags) => {
        persist(undefined, undefined, newTags);
    }, [persist]);

    return {
        customers, tags, settings, hasSynced,
        setCustomers: (c) => persist(c, undefined, undefined),
        addCustomer, updateCustomer, deleteCustomer,
        updateSettings, updateTags
    };
}

export function useInactivityTimeout(timeoutMs, onTimeout) {
    const timerRef = useRef(null);

    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(onTimeout, timeoutMs);
    }, [timeoutMs, onTimeout]);

    useEffect(() => {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(e => window.addEventListener(e, resetTimer));
        resetTimer();
        return () => {
            events.forEach(e => window.removeEventListener(e, resetTimer));
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [resetTimer]);
}

export function useSearch(customers, query) {
    return customers.filter(c => {
        if (!query) return true;
        const terms = query.toLowerCase().split(/\s+/).filter(t => t);

        return terms.every(term => {
            const nameMatch = (c.name || '').toLowerCase().includes(term);
            const companyMatch = (c.company || '').toLowerCase().includes(term);
            const emailMatch = (c.email || '').toLowerCase().includes(term);
            const tagMatch = (c.tags || []).some(t => t.toLowerCase().includes(term));
            const statusMatch = (c.status || '').toLowerCase().includes(term);
            const packageMatch = (c.packageType || '').toLowerCase().includes(term);

            return nameMatch || companyMatch || emailMatch || tagMatch || statusMatch || packageMatch;
        });
    });
}
