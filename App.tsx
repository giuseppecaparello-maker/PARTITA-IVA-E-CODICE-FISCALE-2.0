/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSX from 'xlsx';
import { useDropzone } from 'react-dropzone';
import { 
  Building2, 
  Search, 
  Download, 
  Upload, 
  XCircle, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Settings, 
  FileSpreadsheet, 
  Table as TableIcon,
  StopCircle,
  Filter
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { CompanyData, EnrichmentResult } from './types';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_MODEL = "gemini-3-flash-preview";

export default function App() {
  const [apiKey, setApiKey] = useState(process.env.GEMINI_API_KEY || '');
  const [activeTab, setActiveTab] = useState<'upload' | 'results'>('upload');
  const [companyNames, setCompanyNames] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [results, setResults] = useState<EnrichmentResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentCompany, setCurrentCompany] = useState<string>('');
  const stopProcessingRef = useRef(false);

  // Load results from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('enrichment_results');
    if (saved) {
      try {
        setResults(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved results", e);
      }
    }
  }, []);

  // Save results to local storage when they change
  useEffect(() => {
    localStorage.setItem('enrichment_results', JSON.stringify(results));
  }, [results]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        // Assume first column contains company names
        const names = json.map(row => row[0]).filter(name => typeof name === 'string' && name.trim() !== '');
        setCompanyNames(prev => prev + (prev ? '\n' : '') + names.join('\n'));
      };
      reader.readAsBinaryString(file);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    }
  } as any);

  const enrichCompany = async (name: string, filter: string, key: string) => {
    const ai = new GoogleGenAI({ apiKey: key });
    
    const prompt = `
      Trova i dati fiscali ufficiali per l'azienda: "${name}" ${filter ? `con sede a/in ${filter}` : ''}.
      
      Restituisci ESCLUSIVAMENTE un oggetto JSON con i seguenti campi:
      - ragione_sociale_completa
      - partita_iva
      - codice_fiscale
      - forma_giuridica
      - stato_attivita
      - indirizzo
      - citta
      - provincia
      - regione
      - settore
      - sito_web

      REQUISITO CRITICO: Se per uno o più campi non riesci a trovare una corrispondenza certa o il dato non è disponibile, inserisci rigorosamente la dicitura "n/d". 
      Non lasciare campi vuoti né inventare dati.
    `;

    try {
      const response = await ai.models.generateContent({
        model: DEFAULT_MODEL,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ragione_sociale_completa: { type: Type.STRING },
              partita_iva: { type: Type.STRING },
              codice_fiscale: { type: Type.STRING },
              forma_giuridica: { type: Type.STRING },
              stato_attivita: { type: Type.STRING },
              indirizzo: { type: Type.STRING },
              citta: { type: Type.STRING },
              provincia: { type: Type.STRING },
              regione: { type: Type.STRING },
              settore: { type: Type.STRING },
              sito_web: { type: Type.STRING },
            },
            required: [
              "ragione_sociale_completa", "partita_iva", "codice_fiscale", 
              "forma_giuridica", "stato_attivita", "indirizzo", 
              "citta", "provincia", "regione", "settore", "sito_web"
            ]
          }
        },
      });

      const data = JSON.parse(response.text);
      return data as CompanyData;
    } catch (error) {
      console.error(`Error enriching ${name}:`, error);
      throw error;
    }
  };

  const startEnrichment = async () => {
    if (!apiKey) {
      alert("Inserisci la GEMINI_API_KEY nella barra laterale.");
      return;
    }

    const names = companyNames.split('\n').map(n => n.trim()).filter(n => n !== '');
    if (names.length === 0) {
      alert("Inserisci almeno un nome di azienda.");
      return;
    }

    setIsProcessing(true);
    stopProcessingRef.current = false;
    setProgress(0);
    setActiveTab('results');

    const newResults: EnrichmentResult[] = names.map(name => ({
      originalName: name,
      data: {
        ragione_sociale_completa: '...',
        partita_iva: '...',
        codice_fiscale: '...',
        forma_giuridica: '...',
        stato_attivita: '...',
        indirizzo: '...',
        citta: '...',
        provincia: '...',
        regione: '...',
        settore: '...',
        sito_web: '...'
      },
      status: 'pending'
    }));
    setResults(newResults);

    for (let i = 0; i < names.length; i++) {
      if (stopProcessingRef.current) break;

      const name = names[i];
      setCurrentCompany(name);
      
      setResults(prev => prev.map((res, idx) => 
        idx === i ? { ...res, status: 'processing' } : res
      ));

      try {
        const enrichedData = await enrichCompany(name, locationFilter, apiKey);
        setResults(prev => prev.map((res, idx) => 
          idx === i ? { ...res, data: enrichedData, status: 'completed' } : res
        ));
      } catch (error) {
        setResults(prev => prev.map((res, idx) => 
          idx === i ? { ...res, status: 'error', error: String(error) } : res
        ));
      }

      setProgress(((i + 1) / names.length) * 100);
    }

    setIsProcessing(false);
    setCurrentCompany('');
  };

  const stopEnrichment = () => {
    stopProcessingRef.current = true;
    setIsProcessing(false);
  };

  const exportToExcel = () => {
    const exportData = results.map(r => ({
      "Nome Originale": r.originalName,
      ...r.data
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Risultati");
    XLSX.writeFile(workbook, "company_enrichment_results.xlsx");
  };

  const exportToCSV = () => {
    const exportData = results.map(r => ({
      "Nome Originale": r.originalName,
      ...r.data
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "company_enrichment_results.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearResults = () => {
    if (confirm("Sei sicuro di voler cancellare tutti i risultati?")) {
      setResults([]);
      localStorage.removeItem('enrichment_results');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        <div className="p-6 border-bottom border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            <h1 className="font-bold text-lg text-gray-800">Data Enrichment</h1>
          </div>
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Company Tool</p>
        </div>

        <div className="p-6 flex-1 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-2">
              <Settings className="w-3 h-3" />
              GEMINI_API_KEY
            </label>
            <input 
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Inserisci API Key..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
            <p className="text-[10px] text-gray-400">La chiave viene salvata localmente nel browser.</p>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-xs font-bold text-gray-700 mb-4 uppercase tracking-widest">Stato Processo</h3>
            {isProcessing ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">In corso...</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-500 font-bold">
                    <span>PROGRESSO</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-blue-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">Analisi attuale:</p>
                  <p className="text-xs text-blue-800 font-medium truncate">{currentCompany}</p>
                </div>
                <button 
                  onClick={stopEnrichment}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors border border-red-100"
                >
                  <StopCircle className="w-4 h-4" />
                  Interrompi
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">Pronto</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50/50">
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Utilizza il grounding di Google Search per trovare dati fiscali ufficiali.
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header Tabs */}
        <header className="bg-white border-b border-gray-200 px-8 flex items-center justify-between h-16 shrink-0">
          <nav className="flex gap-8 h-full">
            <button 
              onClick={() => setActiveTab('upload')}
              className={cn(
                "h-full px-2 flex items-center gap-2 text-sm font-bold transition-all border-b-2",
                activeTab === 'upload' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              <Upload className="w-4 h-4" />
              Caricamento
            </button>
            <button 
              onClick={() => setActiveTab('results')}
              className={cn(
                "h-full px-2 flex items-center gap-2 text-sm font-bold transition-all border-b-2",
                activeTab === 'results' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              <TableIcon className="w-4 h-4" />
              Risultati
              {results.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded-full">
                  {results.length}
                </span>
              )}
            </button>
          </nav>

          <div className="flex items-center gap-3">
            {results.length > 0 && (
              <>
                <button 
                  onClick={clearResults}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  title="Pulisci risultati"
                >
                  <XCircle className="w-5 h-5" />
                </button>
                <div className="h-4 w-px bg-gray-200 mx-1" />
                <button 
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                >
                  <Download className="w-3 h-3" />
                  CSV
                </button>
                <button 
                  onClick={exportToExcel}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  Excel
                </button>
              </>
            )}
          </div>
        </header>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'upload' ? (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      Inserimento Manuale
                    </h2>
                    <textarea 
                      value={companyNames}
                      onChange={(e) => setCompanyNames(e.target.value)}
                      placeholder="Inserisci i nomi delle aziende (uno per riga)..."
                      className="w-full h-64 p-4 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none bg-white shadow-sm"
                    />
                  </div>

                  <div className="space-y-4">
                    <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      Caricamento File
                    </h2>
                    <div 
                      {...getRootProps()} 
                      className={cn(
                        "h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-8 transition-all cursor-pointer bg-white shadow-sm",
                        isDragActive ? "border-blue-500 bg-blue-50/50" : "border-gray-200 hover:border-blue-400 hover:bg-gray-50"
                      )}
                    >
                      <input {...getInputProps()} />
                      <div className="p-4 bg-gray-50 rounded-full mb-4">
                        <Upload className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-sm font-bold text-gray-700 text-center">
                        Trascina qui i file o clicca per caricare
                      </p>
                      <p className="text-xs text-gray-400 mt-2">Supporta CSV, XLSX, XLS</p>
                    </div>
                  </div>
                </section>

                <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                    <Filter className="w-4 h-4 text-blue-600" />
                    Filtri Opzionali
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sede Legale (Città/Regione)</label>
                      <input 
                        type="text"
                        value={locationFilter}
                        onChange={(e) => setLocationFilter(e.target.value)}
                        placeholder="Es: Milano, Lombardia..."
                        className="w-full px-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </section>

                <div className="flex justify-center pt-4">
                  <button 
                    onClick={startEnrichment}
                    disabled={isProcessing}
                    className={cn(
                      "flex items-center gap-3 px-10 py-4 bg-blue-600 text-white rounded-full font-bold text-lg shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
                      isProcessing && "animate-pulse"
                    )}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Elaborazione in corso...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        Avvia Ricerca
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col"
              >
                {results.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-4">
                    <TableIcon className="w-16 h-16 opacity-20" />
                    <p className="font-medium">Nessun risultato disponibile. Avvia una ricerca per iniziare.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50/80 border-b border-gray-200">
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Stato</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Input</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Ragione Sociale</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">P. IVA</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Cod. Fiscale</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Forma</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Città</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Settore</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Sito Web</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {results.map((res, i) => (
                            <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-4 py-3">
                                {res.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                {res.status === 'processing' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                                {res.status === 'pending' && <div className="w-4 h-4 border-2 border-gray-200 rounded-full" />}
                                {res.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" title={res.error} />}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-600 truncate max-w-[150px]">{res.originalName}</td>
                              <td className={cn(
                                "px-4 py-3 text-sm font-medium truncate max-w-[200px]",
                                res.data.ragione_sociale_completa === 'n/d' ? "text-red-400 italic bg-red-50/30" : "text-gray-900"
                              )}>
                                {res.data.ragione_sociale_completa}
                              </td>
                              <td className={cn(
                                "px-4 py-3 text-sm font-mono",
                                res.data.partita_iva === 'n/d' ? "text-red-400 italic bg-red-50/30" : "text-gray-600"
                              )}>
                                {res.data.partita_iva}
                              </td>
                              <td className={cn(
                                "px-4 py-3 text-sm font-mono",
                                res.data.codice_fiscale === 'n/d' ? "text-red-400 italic bg-red-50/30" : "text-gray-600"
                              )}>
                                {res.data.codice_fiscale}
                              </td>
                              <td className={cn(
                                "px-4 py-3 text-sm",
                                res.data.forma_giuridica === 'n/d' ? "text-red-400 italic bg-red-50/30" : "text-gray-600"
                              )}>
                                {res.data.forma_giuridica}
                              </td>
                              <td className={cn(
                                "px-4 py-3 text-sm",
                                res.data.citta === 'n/d' ? "text-red-400 italic bg-red-50/30" : "text-gray-600"
                              )}>
                                {res.data.citta}
                              </td>
                              <td className={cn(
                                "px-4 py-3 text-sm truncate max-w-[150px]",
                                res.data.settore === 'n/d' ? "text-red-400 italic bg-red-50/30" : "text-gray-600"
                              )}>
                                {res.data.settore}
                              </td>
                              <td className={cn(
                                "px-4 py-3 text-sm truncate max-w-[150px]",
                                res.data.sito_web === 'n/d' ? "text-red-400 italic bg-red-50/30" : "text-blue-600 underline"
                              )}>
                                {res.data.sito_web !== 'n/d' ? (
                                  <a href={res.data.sito_web.startsWith('http') ? res.data.sito_web : `https://${res.data.sito_web}`} target="_blank" rel="noopener noreferrer">
                                    {res.data.sito_web}
                                  </a>
                                ) : 'n/d'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
