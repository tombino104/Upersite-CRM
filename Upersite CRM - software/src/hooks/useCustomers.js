import { useState, useEffect, useCallback, useRef } from 'react';
import { saveData, syncWithFileSystem, defaultData } from '../utils/storage';

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


    // Debounced auto-save
    useEffect(() => {
        if (!hasSynced) return;

        const timer = setTimeout(() => {
            saveData({
                customers,
                settings,
                tags,
            });
        }, 1000); // Save after 1 second of inactivity

        return () => clearTimeout(timer);
    }, [customers, settings, tags, hasSynced]);

    const addCustomer = useCallback((customer) => {
        setCustomers(prev => [...prev, customer]);
    }, []);

    const updateCustomer = useCallback((id, updates) => {
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    }, []);

    const deleteCustomer = useCallback((id) => {
        setCustomers(prev => prev.filter(c => c.id !== id));
    }, []);

    const updateSettings = useCallback((newSettings) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    }, []);

    const updateTags = useCallback((newTags) => {
        setTags(newTags);
    }, []);

    return {
        customers, tags, settings, hasSynced,
        setCustomers,
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
        const rawTerms = query.toLowerCase().split(/\s+/).filter(t => t);

        const tagTerms = rawTerms
            .filter(t => t.startsWith('#') && t.length > 1)
            .map(t => t.slice(1));

        const textTerms = rawTerms.filter(t => !(t.startsWith('#') && t.length > 1));

        const tags = (c.tags || []).map(t => (t || '').toLowerCase());

        const allText = [
            c.name,
            c.company,
            c.email,
            c.phone,
            c.status,
            c.packageType,
            ...(c.notes || []).map(n => n.text),
            ...(c.todo || []).map(t => t.text)
        ].filter(Boolean).join(' ').toLowerCase();

        const matchTagTerm = (term) => tags.some(t => t.toLowerCase().includes(term.toLowerCase()));

        // Explicit tag filters (#tag)
        const tagsOk = tagTerms.every(matchTagTerm);

        // General terms (match text OR tags)
        const textOk = textTerms.every(term => 
            allText.includes(term.toLowerCase()) || 
            matchTagTerm(term)
        );

        return tagsOk && textOk;
    });
}
