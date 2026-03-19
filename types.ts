export interface CompanyData {
  ragione_sociale_completa: string;
  partita_iva: string;
  codice_fiscale: string;
  forma_giuridica: string;
  stato_attivita: string;
  indirizzo: string;
  citta: string;
  provincia: string;
  regione: string;
  settore: string;
  sito_web: string;
}

export interface EnrichmentResult {
  originalName: string;
  data: CompanyData;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}
