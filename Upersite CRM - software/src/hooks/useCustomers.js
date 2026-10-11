import { useState, useEffect, useCallback, useRef } from 'react';

import { saveData, syncWithFileSystem, defaultData, generateId } from '../utils/storage';

import { emit, WorkflowEventTypes } from '../utils/workflowEvents';

import { runWorkflow } from '../utils/workflowRunner';



export function useCustomers() {

    const [customers, setCustomers] = useState([]);

    const [tags, setTags] = useState(defaultData.tags || []);

    const [events, setEvents] = useState(defaultData.events || []);

    const [chatHistory, setChatHistory] = useState(defaultData.chatHistory || []);

    const [aiUsageStats, setAiUsageStats] = useState(defaultData.aiUsageStats || { date: '', count: 0 });

    const [workflows, setWorkflows] = useState(defaultData.workflows || []);

    const [workflowLogs, setWorkflowLogs] = useState(defaultData.workflowLogs || []);

    const [userProfile, setUserProfile] = useState(defaultData.userProfile || {

        name: '',

        email: '',

        phone: '',

        company: '',

        role: '',

        photo: '',

        bio: '',

        preferences: {

            theme: 'light',

            language: 'it'

        }

    });

    const [settings, setSettings] = useState(defaultData.settings);

    const [hasSynced, setHasSynced] = useState(false);



    // Ref per accesso diretto nel runner (evita stale closures)

    const customersRef = useRef(customers);

    useEffect(() => { customersRef.current = customers; }, [customers]);

    const workflowsRef = useRef(workflows);

    useEffect(() => { workflowsRef.current = workflows; }, [workflows]);

    const isLoggedInRef = useRef(false);

    // Ref per il timer dello scheduler

    const schedulerRef = useRef(null);



    useEffect(() => {

        async function init() {

            const data = await syncWithFileSystem();

            setCustomers(data.customers || []);

            setTags(data.tags || defaultData.tags || []);

            setEvents(data.events || defaultData.events || []);

            setChatHistory(data.chatHistory || defaultData.chatHistory || []);

            setWorkflows(data.workflows || defaultData.workflows || []);

            setWorkflowLogs(data.workflowLogs || defaultData.workflowLogs || []);

            // Reset AI usage count if date changed (midnight reset)

            const savedStats = data.aiUsageStats || defaultData.aiUsageStats;

            const today = new Date().toISOString().slice(0, 10);

            setAiUsageStats(savedStats.date === today ? savedStats : { date: today, count: 0 });

            setSettings(data.settings || defaultData.settings);

            setUserProfile(data.userProfile || defaultData.userProfile);

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

                events,

                chatHistory,

                aiUsageStats,

                userProfile,

                workflows,

                workflowLogs,

            });

        }, 1000); // Save after 1 second of inactivity



        return () => clearTimeout(timer);

    }, [customers, settings, tags, events, chatHistory, aiUsageStats, userProfile, workflows, workflowLogs, hasSynced]);



    // ─── Workflow Engine ───

    const triggerWorkflows = useCallback(async (eventType, eventPayload) => {

        console.log(`[WorkflowEngine] Evento ricevuto: ${eventType}`, eventPayload);

        

        const activeWorkflows = workflowsRef.current.filter(wf =>

            wf.enabled !== false && wf.status !== 'broken'

        );

        

        console.log(`[WorkflowEngine] Workflow attivi: ${activeWorkflows.length}`);



        const matchingWorkflows = activeWorkflows.filter(wf => {

            const triggerNode = (wf.nodes || []).find(n => n.type === 'triggerNode');

            const matches = triggerNode && triggerNode.data?.eventType === eventType;

            if (triggerNode) {

                console.log(`[WorkflowEngine] Workflow "${wf.name}": trigger=${triggerNode.data?.eventType}, match=${matches}`);

            }

            return matches;

        });



        console.log(`[WorkflowEngine] Workflow matching: ${matchingWorkflows.length}`);



        if (matchingWorkflows.length === 0) {

            console.log(`[WorkflowEngine] Nessun workflow trovato per evento: ${eventType}`);

            return;

        }



        const appState = { isLoggedIn: isLoggedInRef.current, isUnlocked: isLoggedInRef.current };



        const crmActions = {

            updateCustomer: (id, updates) => {

                setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));

            },

            getCustomer: (id) => customersRef.current.find(c => c.id === id),

            getWorkflow: (id) => workflowsRef.current.find(w => w.id === id),

            triggerBackup: () => {

                import('../utils/storage').then(mod => mod.triggerAutoBackup());

            },

            exportBackup: () => {

                import('../utils/storage').then(mod => mod.exportData());

            },

        };



        for (const wf of matchingWorkflows) {

            console.log(`[WorkflowEngine] Esecuzione workflow: ${wf.name}`);

            try {

                const log = await runWorkflow(wf, { type: eventType, ...eventPayload }, crmActions, appState);

                console.log(`[WorkflowEngine] Workflow "${wf.name}" completato: ${log.status}`, log);

                setWorkflowLogs(prev => [...prev.slice(-199), log]);

            } catch (err) {

                console.error(`[WorkflowEngine] Errore nel workflow ${wf.name}:`, err);

            }

        }

    }, []);



    // ─── Scheduler: trigger temporali ───

    useEffect(() => {

        if (!hasSynced) return;



        const checkSchedules = () => {

            const now = new Date();

            const timeStr = now.toTimeString().slice(0, 5); // HH:MM

            const dayNames = ['Domenica', 'Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato'];

            const dayName = dayNames[now.getDay()];

            const dayOfMonth = now.getDate();

            const dateStr = now.toISOString().split('T')[0];



            console.log(`[Scheduler] Check ore ${timeStr} - ${workflowsRef.current.length} workflow totali`);



            workflowsRef.current.forEach(wf => {

                if (wf.enabled === false || wf.status === 'broken') return;

                const triggerNode = (wf.nodes || []).find(n => n.type === 'triggerNode');

                if (!triggerNode) return;



                const { eventType, eventConfig = {} } = triggerNode.data || {};



                if (eventType?.startsWith('schedule.')) {

                    console.log(`[Scheduler] Workflow "${wf.name}": ${eventType} alle ${eventConfig.time}`);

                }



                if (eventType === 'schedule.daily' && eventConfig.time === timeStr) {

                    console.log(`[Scheduler] ATTIVAZIONE daily: ${wf.name}`);

                    triggerWorkflows('schedule.daily', { scheduledTime: timeStr });

                } else if (eventType === 'schedule.weekly' && eventConfig.time === timeStr && eventConfig.day === dayName) {

                    console.log(`[Scheduler] ATTIVAZIONE weekly: ${wf.name}`);

                    triggerWorkflows('schedule.weekly', { scheduledTime: timeStr, day: dayName });

                } else if (eventType === 'schedule.monthly' && eventConfig.time === timeStr && parseInt(eventConfig.dayOfMonth) === dayOfMonth) {

                    console.log(`[Scheduler] ATTIVAZIONE monthly: ${wf.name}`);

                    triggerWorkflows('schedule.monthly', { scheduledTime: timeStr, dayOfMonth });

                } else if (eventType === 'schedule.date' && eventConfig.date === dateStr && eventConfig.time === timeStr) {

                    console.log(`[Scheduler] ATTIVAZIONE date: ${wf.name}`);

                    triggerWorkflows('schedule.date', { scheduledDate: dateStr, scheduledTime: timeStr });

                }

            });

        };



        // Controlla ogni minuto

        schedulerRef.current = setInterval(checkSchedules, 60000);

        return () => clearInterval(schedulerRef.current);

    }, [hasSynced, triggerWorkflows]);



    // --- AUTOMATION RULES (LOGIC-BASED) ---

    const runAutomations = (customer, updates) => {

        let finalUpdates = { ...updates };

        const merged = { ...customer, ...updates };



        // RULE 1: Auto-Move Prospect -> In Lavorazione

        // Solo se non stiamo impostando esplicitamente lo stato a 'prospect' in questo aggiornamento

        if (merged.status === 'prospect' && updates.status !== 'prospect') {

            const hasNotes = (merged.notes && merged.notes.length > 0);

            const hasFiles = (merged.files && merged.files.length > 0);

            if (hasNotes || hasFiles) {

                finalUpdates.status = 'working';

            }

        }



        // RULE 2: Tag-Based Templates

        const TAG_TEMPLATES = {

            '#SitoWeb': ["Richiesta Loghi", "Setup Hosting", "Bozza Home Page", "Integrazione Google Search Console"],

            '#Social': ["Piano Editoriale", "Accessi Meta Business Suite", "Analisi Competitor"],

            '#Consulenza': ["Brief Iniziale", "Preparazione Report", "Fatturazione"]

        };



        const currentTags = merged.tags || [];

        const currentTodos = merged.todo || [];



        Object.entries(TAG_TEMPLATES).forEach(([triggerTag, templateTasks]) => {

            if (currentTags.includes(triggerTag) && currentTodos.length === 0) {

                const newTasks = templateTasks.map(text => ({

                    id: generateId(),

                    text,

                    priority: 'Media',

                    dueDate: '',

                    completed: false,

                    createdAt: new Date().toISOString(),

                    readAt: null,

                    subtasks: [],

                    description: '',

                    linkedFiles: [],

                    linkedNotes: [],

                    recurrence: 'none'

                }));

                finalUpdates.todo = [...(finalUpdates.todo || currentTodos), ...newTasks];

            }

        });



        // RULE 3: Payment-Task Sync

        if (updates.installments) {

            const previousInstallments = customer.installments || [];

            const newInstallments = updates.installments;



            // Check if any installment was just marked as paid

            newInstallments.forEach((inst, idx) => {

                const prev = previousInstallments[idx];

                if (inst.paid && (!prev || !prev.paid)) {

                    // Auto-complete tasks matching this amount

                    const amount = inst.amount || '';

                    if (amount) {

                        const completeRecursive = (tasks) => tasks.map(t => {

                            const match = t.text.includes(amount.toString());

                            if (match) return { ...t, completed: true, readAt: new Date().toISOString() };

                            if (t.subtasks) return { ...t, subtasks: completeRecursive(t.subtasks) };

                            return t;

                        });

                        finalUpdates.todo = completeRecursive(finalUpdates.todo || currentTodos);

                    }

                }

            });

        }



        return finalUpdates;

    };



    const addCustomer = useCallback((customer) => {

        const automated = runAutomations({ status: 'prospect', todo: [], notes: [], files: [], tags: [] }, customer);

        const finalCustomer = { ...customer, ...automated };

        setCustomers(prev => [...prev, finalCustomer]);

        // Emetti evento per il workflow engine

        triggerWorkflows(WorkflowEventTypes.CUSTOMER_CREATED, { customer: finalCustomer, cliente: finalCustomer });

    }, [triggerWorkflows]);



    const updateCustomer = useCallback((id, updates) => {

        setCustomers(prev => prev.map(c => {

            if (c.id === id) {

                const automatedUpdates = runAutomations(c, updates);

                const updated = { ...c, ...updates, ...automatedUpdates };



                // Emetti eventi specifici

                if (updates.status && updates.status !== c.status) {

                    triggerWorkflows(WorkflowEventTypes.CUSTOMER_STATUS_CHANGED, {

                        customer: updated, cliente: updated,

                        previousStatus: c.status, newStatus: updates.status,

                    });

                }

                // Tag aggiunto

                if (updates.tags) {

                    const oldTags = c.tags || [];

                    const newTags = updates.tags || [];

                    newTags.filter(t => !oldTags.includes(t)).forEach(tag => {

                        triggerWorkflows(WorkflowEventTypes.TAG_ADDED, { customer: updated, cliente: updated, tag });

                    });

                    oldTags.filter(t => !newTags.includes(t)).forEach(tag => {

                        triggerWorkflows(WorkflowEventTypes.TAG_REMOVED, { customer: updated, cliente: updated, tag });

                    });

                }

                // Nota creata (rilevazione per ID, più robusta della lunghezza)

                if (updates.notes) {

                    const oldNoteIds = new Set((c.notes || []).map(n => n.id));

                    const newNotes = updates.notes.filter(n => n.id && !oldNoteIds.has(n.id));

                    newNotes.forEach(newNote => {

                        console.log(`[WorkflowEngine] Nuova nota rilevata: ${newNote.id}`);

                        triggerWorkflows(WorkflowEventTypes.NOTE_CREATED_ON_CUSTOMER, {

                            customer: updated, cliente: updated, note: newNote, nota: newNote,

                        });

                    });

                }

                // Task creato (rilevazione per ID, più robusta della lunghezza)

                if (updates.todo) {

                    const extractAllIds = (tasks) => {

                        const ids = [];

                        (tasks || []).forEach(t => {

                            ids.push(t.id);

                            if (t.subtasks) ids.push(...extractAllIds(t.subtasks));

                        });

                        return ids;

                    };

                    const oldTaskIds = new Set(extractAllIds(c.todo));

                    const findNewTasks = (tasks) => {

                        const newTasks = [];

                        (tasks || []).forEach(t => {

                            if (t.id && !oldTaskIds.has(t.id)) {

                                newTasks.push(t);

                            }

                            if (t.subtasks) newTasks.push(...findNewTasks(t.subtasks));

                        });

                        return newTasks;

                    };

                    const newTasks = findNewTasks(updates.todo);

                    console.log(`[WorkflowEngine] Nuovi task rilevati: ${newTasks.length}`);

                    newTasks.forEach(newTask => {

                        triggerWorkflows(WorkflowEventTypes.TASK_CREATED, {

                            customer: updated, cliente: updated, task: newTask,

                        });

                    });

                }

                // Task completato

                if (updates.todo) {

                    const findCompletedTasks = (oldTasks, newTasks) => {

                        const completed = [];

                        const oldMap = new Map();

                        const buildMap = (tasks) => {

                            (tasks || []).forEach(t => {

                                oldMap.set(t.id, t);

                                if (t.subtasks) buildMap(t.subtasks);

                            });

                        };

                        buildMap(oldTasks);

                        const checkCompleted = (tasks) => {

                            (tasks || []).forEach(t => {

                                const old = oldMap.get(t.id);

                                if (old && !old.completed && t.completed) {

                                    completed.push(t);

                                }

                                if (t.subtasks) checkCompleted(t.subtasks);

                            });

                        };

                        checkCompleted(newTasks);

                        return completed;

                    };

                    const completedTasks = findCompletedTasks(c.todo, updates.todo);

                    completedTasks.forEach(task => {

                        console.log(`[WorkflowEngine] Task completato: ${task.id}`);

                        triggerWorkflows(WorkflowEventTypes.TASK_COMPLETED, {

                            customer: updated, cliente: updated, task: task,

                        });

                    });

                }

                // Pagamento registrato

                if (updates.installments) {

                    const prevInst = c.installments || [];

                    const newInst = updates.installments || [];

                    newInst.forEach((inst, idx) => {

                        const prev = prevInst[idx];

                        if (inst.paid && (!prev || !prev.paid)) {

                            triggerWorkflows(WorkflowEventTypes.PAYMENT_REGISTERED, {

                                customer: updated, cliente: updated, payment: inst, pagamento: inst,

                            });

                        }

                    });

                }



                triggerWorkflows(WorkflowEventTypes.CUSTOMER_UPDATED, { customer: updated, cliente: updated });

                return updated;

            }

            return c;

        }));

    }, [triggerWorkflows]);



    const deleteCustomer = useCallback((id) => {

        const customer = customersRef.current.find(c => c.id === id);

        setCustomers(prev => prev.filter(c => c.id !== id));

        if (customer) {

            triggerWorkflows(WorkflowEventTypes.CUSTOMER_DELETED, { customer, cliente: customer });

        }

    }, [triggerWorkflows]);



    const updateSettings = useCallback((newSettings) => {

        setSettings(prev => ({ ...prev, ...newSettings }));

    }, []);



    const updateTags = useCallback((newTags) => {

        setTags(newTags);

    }, []);



    const updateEvents = useCallback((newEvents) => {

        setEvents(newEvents);

    }, []);



    const updateChatHistory = useCallback((newHistory) => {

        setChatHistory(newHistory);

    }, []);



    const updateAiUsageStats = useCallback((newStats) => {

        setAiUsageStats(newStats);

    }, []);



    const updateUserProfile = useCallback((newProfile) => {

        setUserProfile(newProfile);

    }, []);



    // ─── Workflow CRUD ───

    const saveWorkflow = useCallback((workflow) => {

        setWorkflows(prev => {

            const idx = prev.findIndex(w => w.id === workflow.id);

            if (idx >= 0) {

                const updated = [...prev];

                updated[idx] = workflow;

                return updated;

            }

            return [...prev, workflow];

        });

    }, []);



    const deleteWorkflow = useCallback((workflowId) => {

        setWorkflows(prev => prev.filter(w => w.id !== workflowId));

        setWorkflowLogs(prev => prev.filter(l => l.workflowId !== workflowId));

    }, []);



    const notifyLogin = useCallback(() => {

        isLoggedInRef.current = true;

        triggerWorkflows(WorkflowEventTypes.USER_LOGIN, { app: { isLoggedIn: true } });

        triggerWorkflows(WorkflowEventTypes.APP_STARTED, { app: { isLoggedIn: true } });

    }, [triggerWorkflows]);



    const notifyLogout = useCallback(() => {

        isLoggedInRef.current = false;

    }, []);



    return {

        customers, tags, settings, events, chatHistory, aiUsageStats, userProfile, hasSynced,

        workflows, workflowLogs,

        setCustomers,

        addCustomer, updateCustomer, deleteCustomer,

        updateSettings, updateTags, updateEvents,

        updateChatHistory, updateAiUsageStats, updateUserProfile,

        saveWorkflow, deleteWorkflow, setWorkflows, setWorkflowLogs,

        triggerWorkflows, notifyLogin, notifyLogout,

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

            ...(c.extraEmails || []),

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

