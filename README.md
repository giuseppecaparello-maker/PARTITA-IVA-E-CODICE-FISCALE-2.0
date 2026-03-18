<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>P.IVA Finder - Business Intelligence</title>
    <!-- Tailwind CSS v3 CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        /* Custom scrollbar */
        :ebkit-scrollbar { width: 8px; }
        :ebkit-scrollbar-track { background: #f5f5f4; }
        :ebkit-scrollbar-thumb { background: #d6d3d1; border-radius: 10px; }
        :ebkit-scrollbar-thumb:hover { background: #a8a29e; }
    </style>
</head>
<body class="bg-stone-50 text-stone-900">
    <div id="root"></div>

    <!-- Import Map per caricare i moduli direttamente nel browser -->
    <script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@18.2.0",
        "react-dom": "https://esm.sh/react-dom@18.2.0",
        "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
        "lucide-react": "https://esm.sh/lucide-react@0.344.0",
        "framer-motion": "https://esm.sh/framer-motion@10.16.4",
        "papaparse": "https://esm.sh/papaparse@5.4.1",
        "@google/genai": "https://esm.sh/@google/genai@0.2.1"
      }
    }
    </script>

    <script type="module">
        import React, { useState, useRef, useEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import { 
            Search, Building2, ExternalLink, Loader2, Info, 
            CheckCircle2, AlertCircle, Upload, Download, 
            FileText, X, Play, RotateCcw, Copy 
        } from 'lucide-react';
        import { motion, AnimatePresence } from 'framer-motion';
        import Papa from 'papaparse';
        import { GoogleGenAI } from '@google/genai';

        // --- CONFIGURAZIONE ---
        // Inserisci qui la tua API Key se vuoi che sia pre-impostata
        let API_KEY = ""; 
        // ----------------------

        function App() {
            const [mode, setMode] = useState('single');
            const [query, setQuery] = useState('');
            const [result, setResult] = useState(null);
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState(null);
            const [apiKey, setApiKey] = useState(API_KEY);
            const [showKeyInput, setShowKeyInput] = useState(!API_KEY);

            // Batch State
            const [batchItems, setBatchItems] = useState([]);
            const [isProcessingBatch, setIsProcessingBatch] = useState(false);
            const [filterLocation, setFilterLocation] = useState('');
            const fileInputRef = useRef(null);

            const filteredBatchItems = batchItems.filter(item => {
                if (!filterLocation.trim()) return true;
                if (!item.result?.headquarters) return false;
                return item.result.headquarters.toLowerCase().includes(filterLocation.toLowerCase());
            });

            const searchCompany = async (companyName) => {
                if (!apiKey) throw new Error("API Key mancante");
                const genAI = new GoogleGenAI({ apiKey });
                
                const prompt = `Trova la Partita IVA e il Codice Fiscale ufficiali per l'azienda italiana: "${companyName}".
                Restituisci ESCLUSIVAMENTE un oggetto JSON con questa struttura:
                {
                    "name": "Nome ufficiale completo",
                    "vatNumber": "Partita IVA (11 cifre)",
                    "taxCode": "Codice Fiscale",
                    "headquarters": "Indirizzo sede legale completo",
                    "description": "Breve descrizione dell'attività",
                    "sourceUrls": ["url1", "url2"]
                }
                Se non trovi i dati, restituisci un errore chiaro nel JSON. Sii preciso e verifica i dati tramite ricerca web.`;

                const response = await genAI.models.generateContent({
                    model: "gemini-1.5-flash",
                    contents: companyName,
                    config: {
                        systemInstruction: prompt,
                        responseMimeType: "application/json"
                    },
                    tools: [{ googleSearch: {} }]
                });

                return JSON.parse(response.text);
            };

            const handleSearch = async (e) => {
                e.preventDefault();
                if (!query.trim()) return;
                setLoading(true);
                setError(null);
                setResult(null);
                try {
                    const data = await searchCompany(query);
                    setResult(data);
                } catch (err) {
                    setError("Impossibile trovare i dati per questa azienda. Verifica il nome e riprova.");
                } finally {
                    setLoading(false);
                }
            };

            const processBatch = async () => {
                setIsProcessingBatch(true);
                const items = [...batchItems];
                for (let i = 0; i < items.length; i++) {
                    if (items[i].status === 'completed') continue;
                    items[i].status = 'processing';
                    setBatchItems([...items]);
                    try {
                        const res = await searchCompany(items[i].query);
                        items[i].result = res;
                        items[i].status = 'completed';
                    } catch (err) {
                        items[i].status = 'error';
                    }
                    setBatchItems([...items]);
                }
                setIsProcessingBatch(false);
            };

            const downloadCSV = () => {
                const itemsToExport = filterLocation.trim() ? filteredBatchItems : batchItems;
                const csv = Papa.unparse(itemsToExport.map(i => ({
                    "Ricerca": i.query,
                    "Nome": i.result?.name || "",
                    "P.IVA": i.result?.vatNumber || "",
                    "C.F.": i.result?.taxCode || "",
                    "Sede": i.result?.headquarters || ""
                })));
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.setAttribute("download", "estrazione_piva.csv");
                link.click();
            };

            if (showKeyInput) {
                return (
                    <div className="min-h-screen flex items-center justify-center p-6 bg-stone-100">
                        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full space-y-6">
                            <div className="text-center">
                                <div className="bg-stone-900 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <Building2 className="text-white w-6 h-6" />
                                </div>
                                <h1 className="text-xl font-bold">Configurazione API</h1>
                                <p className="text-stone-500 text-sm mt-2">Inserisci la tua Gemini API Key per iniziare. I dati rimarranno solo nel tuo browser.</p>
                            </div>
                            <input 
                                type="password" 
                                placeholder="AIza..." 
                                className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-stone-400 outline-none"
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                            <button 
                                onClick={() => apiKey && setShowKeyInput(false)}
                                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all"
                            >
                                Avvia Applicazione
                            </button>
                            <p className="text-[10px] text-center text-stone-400 uppercase tracking-widest">
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" class="underline">Ottieni una chiave gratuita qui</a>
                            </p>
                        </div>
                    </div>
                );
            }

            return (
                <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
                    <header className="w-full max-w-4xl flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
                        <div className="flex items-center space-x-4">
                            <div className="bg-stone-900 p-3 rounded-2xl shadow-lg">
                                <Building2 className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight">P.IVA Finder</h1>
                                <p className="text-stone-500 text-xs font-mono uppercase tracking-widest">Business Intelligence Tool</p>
                            </div>
                        </div>

                        <div className="flex items-center space-x-4">
                            <div className="flex bg-stone-200/50 p-1 rounded-xl border border-stone-200">
                                <button onClick={() => setMode('single')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'single' ? 'bg-white shadow-sm' : 'text-stone-500'}`}>SINGOLA</button>
                                <button onClick={() => setMode('batch')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'batch' ? 'bg-white shadow-sm' : 'text-stone-500'}`}>BATCH</button>
                            </div>
                        </div>
                    </header>

                    <main className="w-full max-w-4xl">
                        {mode === 'single' ? (
                            <div className="max-w-2xl mx-auto space-y-8">
                                <form onSubmit={handleSearch} className="relative">
                                    <input 
                                        type="text" 
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Nome Azienda (es: Ferrari S.p.A.)"
                                        className="w-full h-16 pl-14 pr-32 bg-white border border-stone-300 rounded-2xl shadow-sm focus:ring-2 focus:ring-stone-400 outline-none text-lg"
                                    />
                                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-400" />
                                    <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 h-10 px-6 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all">
                                        {loading ? <Loader2 className="animate-spin w-4 h-4" /> : 'CERCA'}
                                    </button>
                                </form>

                                <AnimatePresence>
                                    {result && (
                                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-stone-200 rounded-3xl shadow-xl overflow-hidden">
                                            <div className="p-8 border-b border-stone-100">
                                                <h2 className="text-2xl font-bold mb-6">{result.name}</h2>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                                        <label className="text-[10px] font-mono uppercase text-stone-400 block mb-1">Partita IVA</label>
                                                        <span className="text-xl font-mono font-bold">{result.vatNumber}</span>
                                                    </div>
                                                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                                        <label className="text-[10px] font-mono uppercase text-stone-400 block mb-1">Codice Fiscale</label>
                                                        <span className="text-xl font-mono font-bold">{result.taxCode}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-8 space-y-4">
                                                <p className="text-stone-600 text-sm leading-relaxed"><span className="font-bold text-stone-900">Sede:</span> {result.headquarters}</p>
                                                <p className="text-stone-600 text-sm leading-relaxed">{result.description}</p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
                                    <h3 className="font-bold flex items-center"><Upload className="w-4 h-4 mr-2" /> Caricamento</h3>
                                    <textarea 
                                        className="w-full h-40 p-4 bg-stone-50 border border-stone-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-stone-400"
                                        placeholder="Un nome per riga..."
                                        onChange={(e) => setBatchItems(e.target.value.split('\n').filter(n => n.trim()).map(n => ({ query: n, status: 'pending' })))}
                                    />
                                    <div className="space-y-2">
                                        <button onClick={processBatch} disabled={isProcessingBatch || batchItems.length === 0} className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center">
                                            {isProcessingBatch ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />} AVVIA ELABORAZIONE
                                        </button>
                                        <button onClick={downloadCSV} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 flex items-center justify-center">
                                            <Download className="w-4 h-4 mr-2" /> SCARICA CSV
                                        </button>
                                    </div>
                                </div>

                                <div className="lg:col-span-2 bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
                                    <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
                                        <span className="text-[10px] font-mono uppercase text-stone-400">Risultati ({filteredBatchItems.length})</span>
                                        <input 
                                            type="text" 
                                            placeholder="Filtra per sede..." 
                                            className="text-xs p-2 border border-stone-200 rounded-lg outline-none"
                                            onChange={(e) => setFilterLocation(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                        {filteredBatchItems.map((item, i) => (
                                            <div key={i} className="p-4 bg-stone-50 border border-stone-100 rounded-2xl flex justify-between items-center">
                                                <div className="overflow-hidden">
                                                    <p className="font-bold text-sm truncate">{item.query}</p>
                                                    <p className="text-[10px] text-stone-400 truncate">{item.result?.headquarters || 'In attesa...'}</p>
                                                </div>
                                                <div className="flex space-x-4 text-[10px] font-mono">
                                                    {item.status === 'completed' ? (
                                                        <span className="text-emerald-600 font-bold">IVA: {item.result.vatNumber}</span>
                                                    ) : item.status === 'processing' ? (
                                                        <Loader2 className="animate-spin w-3 h-3" />
                                                    ) : (
                                                        <span className="text-stone-300">---</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            );
        }

        const root = createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>

