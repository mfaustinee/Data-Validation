import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from './lib/supabase';
import { 
  ClipboardCheck, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Calendar,
  Clock,
  User,
  MapPin,
  Phone,
  FileText,
  ChevronRight,
  ChevronLeft,
  Save,
  Trash2,
  PenTool,
  Image as ImageIcon,
  History,
  Info
} from 'lucide-react';

// Replace this with your actual Supabase public URL
const KDB_LOGO_URL = "https://odolazcniphinupgyaqo.supabase.co/storage/v1/object/sign/Pdf%20logo/KDB-LOGOx100h.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zNDNkNjNiOC1jY2RlLTQwYTgtOGVmMS1lN2UyY2NjNzQ0NjUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJQZGYgbG9nby9LREItTE9HT3gxMDBoLnBuZyIsImlhdCI6MTc3NDQwODY3MywiZXhwIjoyMDg5NzY4NjczfQ.r_8Gre72kWfCNdIGpiNEePogU0ieuPOJYqAyvqJ7YsQ";

interface IntakeEntry {
  month: string;
  year: string;
  quantity: string;
  farmerPrice: string;
  processor: string;
  processorPrice: string;
  avgVolPerDay: string;
}

interface SalesEntry {
  month: string;
  year: string;
  qtyDeclared: string;
  verifiedQty: string;
  projectedQty: string;
  underDeclared: string;
  buyingPrice: string;
  sellingPrice: string;
  avgVolPerDay: string;
}

interface NonComplianceEntry {
  month: string;
  litres: string;
  amount: string;
  paymentMonthYear: string;
  mpesaRef: string;
}

interface FormData {
  branch: string;
  date: string;
  startTime: string;
  endTime: string;
  permitNo: string;
  expiryDate: string;
  dboName: string;
  premiseName: string;
  category: string;
  contacts: string;
  validationPeriod: string;
  location: string;
  county: string;
  // Table Data (Now part of sales)
  traceability: string;
  natureOfProduce: string[];
  source: string;
  complianceOfficer: string;
  complianceSignature: string; // Base64
  confirmationName: string;
  dboSignature: string; // Base64
  dboStamp: string; // Base64
  designation: string;
  hasLocalSales: boolean;
  // Dynamic sections
  intakes: IntakeEntry[];
  sales: SalesEntry[];
  nonCompliance: NonComplianceEntry[];
  comments: string;
}

const getLocalDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

const initialData: FormData = {
  branch: 'Kericho',
  date: getLocalDate(),
  startTime: '',
  endTime: '',
  permitNo: '',
  expiryDate: '',
  dboName: '',
  premiseName: '',
  category: '',
  contacts: '',
  validationPeriod: '',
  location: '',
  county: 'Kericho',
  traceability: 'YES',
  natureOfProduce: [],
  source: '',
  complianceOfficer: '',
  complianceSignature: '',
  confirmationName: '',
  dboSignature: '',
  dboStamp: '',
  designation: '',
  hasLocalSales: true,
  intakes: [{ month: new Date().toLocaleString('default', { month: 'long' }), year: new Date().getFullYear().toString(), quantity: '', farmerPrice: '', processor: '', processorPrice: '', avgVolPerDay: '' }],
  sales: [{ 
    month: new Date().toLocaleString('default', { month: 'long' }), 
    year: new Date().getFullYear().toString(),
    qtyDeclared: '', 
    verifiedQty: '', 
    projectedQty: '', 
    underDeclared: '0', 
    buyingPrice: '', 
    sellingPrice: '', 
    avgVolPerDay: '' 
  }],
  nonCompliance: [],
  comments: '',
};

export default function App() {
  const [formData, setFormData] = useState<FormData>(initialData);
  const [isConnected, setIsConnected] = useState(true); // Default to true for Service Account mode
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [step, setStep] = useState(0);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [lastCollections, setLastCollections] = useState<{ month: string, year: string, date: string, fullPeriod: string, displayString: string, matchedPremise?: string, pdfPath?: string }[]>([]);
  const [isCheckingHistory, setIsCheckingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  
  const [lastDboRecords, setLastDboRecords] = useState<any[]>([]);
  const [isCheckingDbo, setIsCheckingDbo] = useState(false);
  const [dboError, setDboError] = useState<string | null>(null);
  const [declarations, setDeclarations] = useState({
    accurate: false,
    offense: false,
    agreement: false,
    awareness: false
  });

  const [isValidationPeriodEdited, setIsValidationPeriodEdited] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [failedFields, setFailedFields] = useState<string[]>([]);

  const getInputClass = (name: string, extraClasses: string = '', basePadding: string = 'px-4 py-2 rounded-xl') => {
    const isFailed = failedFields.includes(name);
    const borderClass = isFailed
      ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20'
      : 'border-gray-200 focus:border-blue-500 focus:ring-blue-200';
    return `w-full border transition-all outline-none ${basePadding} ${borderClass} ${extraClasses}`;
  };

  useEffect(() => {
    // Auto calculate under declared volume for each sales entry
    const updatedSales = formData.sales.map(sale => {
      const declared = parseFloat(sale.qtyDeclared) || 0;
      const verified = parseFloat(sale.verifiedQty) || 0;
      const diff = Math.max(0, verified - declared);
      return { ...sale, underDeclared: diff.toString() };
    });

    // Auto populate non-compliance based on under-declaration
    const newNonCompliance = formData.hasLocalSales 
      ? updatedSales
        .filter(sale => parseFloat(sale.underDeclared) > 0 && sale.month.trim() !== '')
        .map(sale => {
          const displayMonth = `${sale.month} ${sale.year}`;
          // Find existing entry to preserve data
          const existing = formData.nonCompliance.find(nc => nc.month === displayMonth);
          
          return {
            month: displayMonth,
            litres: sale.underDeclared,
            amount: existing?.amount || '', // Manual entry now
            paymentMonthYear: existing?.paymentMonthYear || '',
            mpesaRef: existing?.mpesaRef || ''
          };
        })
      : [];

    const salesChanged = JSON.stringify(updatedSales) !== JSON.stringify(formData.sales);
    const ncChanged = JSON.stringify(newNonCompliance) !== JSON.stringify(formData.nonCompliance);

    if (salesChanged || ncChanged) {
      setFormData(prev => ({ 
        ...prev, 
        sales: updatedSales,
        nonCompliance: newNonCompliance 
      }));
    }
  }, [formData.sales]);

  const totalPenalty = formData.nonCompliance.reduce((sum, nc) => sum + (parseFloat(nc.amount) || 0), 0);

  useEffect(() => {
    const verifyApi = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data: any = await res.json();
          console.log('API is healthy', data);
          setIsConnected(data.configured);
        } else {
          console.log('API health check failed:', res.status);
          setIsConnected(false);
        }
      } catch (err) {
        console.error('API unreachable:', err);
        setIsConnected(false);
      }
    };
    verifyApi();
  }, []);

  // Fetch last 3 months history for the Premise
  useEffect(() => {
    const fetchHistory = async () => {
      if (!supabase || !formData.premiseName || formData.premiseName.trim().length < 3) {
        setLastCollections([]);
        setHistoryError(null);
        return;
      }

      setIsCheckingHistory(true);
      setHistoryError(null);
      try {
        const searchTerm = formData.premiseName.trim();
        // Use partial matching with wildcards for long names
        const { data, error } = await supabase
          .from('kdb_validations')
          .select('validation_period, date, premise_name, raw_data, pdf_path')
          .ilike('premise_name', `%${searchTerm}%`)
          .order('date', { ascending: false })
          .limit(50); // Fetch more records to ensure we get all historical months

        if (error) throw error;

        if (data) {
          const allExtractedMonths: { period: string; pdfPath?: string; score: number }[] = [];
          
          const extractPeriodsFromString = (str: string): { period: string; score: number }[] => {
            if (!str) return [];
            const results: { period: string; score: number }[] = [];
            
            const fullMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            const shortMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            
            // Clean up and lowercase to keep parsing simple
            const cleanStr = str.toLowerCase().replace(/[^a-z0-9]/g, ' ');
            const words = cleanStr.split(/\s+/).filter(Boolean);
            
            // Find 4-digit years or 2-digit years
            const years: number[] = [];
            words.forEach(w => {
              const num = parseInt(w, 10);
              if (!isNaN(num)) {
                if (num >= 2000 && num <= 2100) {
                  years.push(num);
                } else if (num >= 20 && num <= 99 && w.length === 2) {
                  years.push(2000 + num);
                }
              }
            });

            const defaultYear = years.length > 0 ? years[years.length - 1] : new Date().getFullYear();
            
            // Find all month words
            const foundMonths: { name: string; index: number; wordPosition: number }[] = [];
            words.forEach((w, idx) => {
              let mIdx = fullMonths.indexOf(w);
              if (mIdx === -1) {
                if (w === 'sept') {
                  mIdx = 8;
                } else {
                  mIdx = shortMonths.indexOf(w);
                }
              }
              if (mIdx !== -1) {
                foundMonths.push({
                  name: fullMonths[mIdx],
                  index: mIdx,
                  wordPosition: idx
                });
              }
            });

            if (foundMonths.length === 0) {
              return [];
            }

            const isRange = str.includes('-') || str.toLowerCase().includes('to') || str.toLowerCase().includes('through');
            
            // Handle cross-year and single-year ranges like "Oct - Dec 24" or "Oct 24 to Feb 25"
            if (foundMonths.length === 2 && isRange) {
              const m1 = foundMonths[0];
              const m2 = foundMonths[1];
              
              const getYearForMonth = (wordPos: number) => {
                if (years.length === 0) return defaultYear;
                let closestYear = years[0];
                let minDistance = Infinity;
                words.forEach((w, wIdx) => {
                  const num = parseInt(w, 10);
                  if (!isNaN(num)) {
                    let yVal = num;
                    if (num >= 20 && num <= 99 && w.length === 2) {
                      yVal = 2000 + num;
                    }
                    if (yVal >= 2000 && yVal <= 2100) {
                      const dist = Math.abs(wIdx - wordPos);
                      if (dist < minDistance) {
                        minDistance = dist;
                        closestYear = yVal;
                      }
                    }
                  }
                });
                return closestYear;
              };

              const y1 = getYearForMonth(m1.wordPosition);
              const y2 = getYearForMonth(m2.wordPosition);
              const score1 = y1 * 12 + m1.index;
              const score2 = y2 * 12 + m2.index;
              
              if (score1 <= score2) {
                for (let s = score1; s <= score2; s++) {
                  const y = Math.floor(s / 12);
                  const mIdx = s % 12;
                  const monthName = fullMonths[mIdx];
                  const capMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                  results.push({
                    period: `${capMonthName} ${y}`,
                    score: s
                  });
                }
                return results;
              }
            }

            // Normal individual mapping
            foundMonths.forEach((m) => {
              let associatedYear = defaultYear;
              if (years.length > 0) {
                let minDistance = Infinity;
                words.forEach((w, wIdx) => {
                  const num = parseInt(w, 10);
                  if (!isNaN(num)) {
                    let yVal = num;
                    if (num >= 20 && num <= 99 && w.length === 2) {
                      yVal = 2000 + num;
                    }
                    if (yVal >= 2000 && yVal <= 2100) {
                      const dist = Math.abs(wIdx - m.wordPosition);
                      if (dist < minDistance) {
                        minDistance = dist;
                        associatedYear = yVal;
                      }
                    }
                  }
                });
              }

              const capMonthName = m.name.charAt(0).toUpperCase() + m.name.slice(1);
              results.push({
                period: `${capMonthName} ${associatedYear}`,
                score: associatedYear * 12 + m.index
              });
            });

            return results;
          };

          data.forEach(item => {
            const raw = item.raw_data as any;
            const periodsInThisRecord: string[] = [];
            
            if (raw) {
              const isCoolingPlant = raw.category === 'CP>5,000 L/D' || raw.category === 'CP<5,000 L/D' || raw.category === 'Processor';
              
              if (isCoolingPlant && !raw.hasLocalSales && raw.intakes && raw.intakes.length > 0) {
                raw.intakes.forEach((i: any) => {
                  if (i.month && i.year) {
                    periodsInThisRecord.push(`${i.month} ${i.year}`);
                  }
                });
              } else if (raw.sales && raw.sales.length > 0) {
                raw.sales.forEach((s: any) => {
                  if (s.month && s.year) {
                    periodsInThisRecord.push(`${s.month} ${s.year}`);
                  }
                });
              }
            }
            
            // Always fallback / include the validation_period itself
            if (item.validation_period) {
              periodsInThisRecord.push(item.validation_period);
            }
            
            // Score and parse each period
            periodsInThisRecord.forEach(p => {
              const parsed = extractPeriodsFromString(p);
              parsed.forEach(res => {
                allExtractedMonths.push({ period: res.period, pdfPath: item.pdf_path, score: res.score });
              });
            });
          });

          // Deduplicate based on period, keeping the one with a PDF if possible
          const deduplicated: Record<string, { period: string; pdfPath?: string; score: number }> = {};
          allExtractedMonths.forEach(m => {
            const key = m.period.toLowerCase();
            if (!deduplicated[key] || (!deduplicated[key].pdfPath && m.pdfPath)) {
              deduplicated[key] = m;
            }
          });

          // Convert to array and sort descending by chronological score (newest first)
          const sortedList = Object.values(deduplicated).sort((a, b) => b.score - a.score);

          // Get absolute top 3 newest months
          const top3 = sortedList.slice(0, 3);

          const history = top3.map(m => ({
            month: '', 
            year: '',
            date: '',
            fullPeriod: m.period,
            displayString: m.period,
            matchedPremise: data[0]?.premise_name,
            pdfPath: m.pdfPath
          }));
          setLastCollections(history);
        }
      } catch (err: any) {
        console.error('Error fetching history:', err);
        setHistoryError(err.message || 'Failed to fetch history');
      } finally {
        setIsCheckingHistory(false);
      }
    };

    const timer = setTimeout(fetchHistory, 800); // Debounce lookup
    return () => clearTimeout(timer);
  }, [formData.premiseName]);

  // Fetch previous validations by DBO Name
  useEffect(() => {
    const fetchDboHistory = async () => {
      if (!supabase || !formData.dboName || formData.dboName.trim().length < 3) {
        setLastDboRecords([]);
        setDboError(null);
        return;
      }

      setIsCheckingDbo(true);
      setDboError(null);
      try {
        const searchTerm = formData.dboName.trim();
        const { data, error } = await supabase
          .from('kdb_validations')
          .select('dbo_name, premise_name, category, permit_no, location, county, raw_data, date')
          .ilike('dbo_name', `%${searchTerm}%`)
          .order('date', { ascending: false })
          .limit(10);

        if (error) throw error;
        
        // Deduplicate records by unique premise, permit to yield cleanest autofill options
        if (data) {
          const uniqueMap: Record<string, any> = {};
          data.forEach(item => {
            const key = `${item.premise_name || ''}-${item.permit_no || ''}`.toLowerCase().trim();
            if (!uniqueMap[key]) {
              uniqueMap[key] = item;
            }
          });
          setLastDboRecords(Object.values(uniqueMap).slice(0, 5));
        } else {
          setLastDboRecords([]);
        }
      } catch (err: any) {
        console.error('Error fetching DBO history:', err);
        setDboError(err.message || 'Failed to fetch DBO history');
      } finally {
        setIsCheckingDbo(false);
      }
    };

    const timer = setTimeout(fetchDboHistory, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [formData.dboName]);

  // Load saved draft on mount
  useEffect(() => {
    const draft = localStorage.getItem('kdb_validation_form_draft');
    if (draft) {
      try {
        JSON.parse(draft);
        setHasDraft(true);
      } catch (e) {
        localStorage.removeItem('kdb_validation_form_draft');
      }
    }
  }, []);

  // Save draft when form data changes
  useEffect(() => {
    const hasPopulatedInput = 
      formData.dboName || 
      formData.premiseName || 
      formData.permitNo || 
      formData.validationPeriod || 
      formData.sales.some(s => s.qtyDeclared || s.verifiedQty) ||
      formData.intakes.some(i => i.quantity);

    if (hasPopulatedInput) {
      localStorage.setItem('kdb_validation_form_draft', JSON.stringify(formData));
    }
  }, [formData]);

  const handleRestoreDraft = () => {
    const draft = localStorage.getItem('kdb_validation_form_draft');
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setFormData(parsed);
        setFailedFields([]);
        // Re-eval step based on draft data
        if (parsed.branch) setStep(1); // Resume at step 1 if the user started
        setStatus({ type: 'success', message: 'Unsaved draft successfully restored!' });
      } catch (e) {
        console.error(e);
      }
    }
    setHasDraft(false);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem('kdb_validation_form_draft');
    setHasDraft(false);
    setStatus({ type: 'success', message: 'Draft cleared.' });
  };

  const handleDboAutofill = (record: any) => {
    const raw = record.raw_data || {};
    setFormData(prev => ({
      ...prev,
      dboName: record.dbo_name || prev.dboName,
      permitNo: raw.permitNo || record.permit_no || prev.permitNo,
      premiseName: raw.premiseName || record.premise_name || prev.premiseName,
      category: raw.category || record.category || prev.category,
      contacts: raw.contacts || prev.contacts,
      county: raw.county || record.county || prev.county,
      location: raw.location || record.location || prev.location,
      expiryDate: raw.expiryDate || prev.expiryDate || '',
      validationPeriod: raw.validationPeriod || prev.validationPeriod || '',
    }));
    
    // Once they autofill, allow override and prevent background useEffect from overriding it
    setIsValidationPeriodEdited(true);

    // Clear matches to hide suggestions
    setLastDboRecords([]);
    
    // Clear any failed fields
    setFailedFields(prev => prev.filter(f => ![
      'dboName', 'permitNo', 'premiseName', 'category', 'contacts', 'county', 'location', 'expiryDate'
    ].includes(f)));
  };

  // Auto-populate validation period from table data
  useEffect(() => {
    if (isValidationPeriodEdited) return;

    const isCoolingPlant = formData.category === 'CP>5,000 L/D' || formData.category === 'CP<5,000 L/D' || formData.category === 'Processor';
    
    let period = '';
    if (isCoolingPlant) {
      // For cooling plants, prioritize intakes if local sales are disabled
      if (!formData.hasLocalSales && formData.intakes.length > 0) {
        const lastIntake = formData.intakes[formData.intakes.length - 1];
        if (lastIntake.month && lastIntake.year) period = `${lastIntake.month} ${lastIntake.year}`;
      } else if (formData.sales.length > 0) {
        const lastSale = formData.sales[formData.sales.length - 1];
        if (lastSale.month && lastSale.year) period = `${lastSale.month} ${lastSale.year}`;
      }
    } else {
      // For other categories, check sales
      if (formData.sales.length > 0) {
        const lastSale = formData.sales[formData.sales.length - 1];
        if (lastSale.month && lastSale.year) period = `${lastSale.month} ${lastSale.year}`;
      }
    }

    if (period && period !== formData.validationPeriod) {
      setFormData(prev => ({ ...prev, validationPeriod: period }));
    } else if (!formData.validationPeriod && formData.date) {
      // If period is empty, default to the month of the validation date
      const d = new Date(formData.date);
      if (!isNaN(d.getTime())) {
        const m = d.toLocaleString('default', { month: 'long' });
        const y = d.getFullYear().toString();
        setFormData(prev => ({ ...prev, validationPeriod: `${m} ${y}` }));
      }
    }
  }, [formData.sales, formData.intakes, formData.hasLocalSales, formData.category, formData.date, isValidationPeriodEdited]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setFailedFields(prev => prev.filter(f => f !== name));
    if (name === 'validationPeriod') {
      setIsValidationPeriodEdited(true);
    }
  };

  const validateStep = (s: number) => {
    const missing: string[] = [];

    if (s === 1) {
      const required = ['branch', 'date', 'permitNo', 'expiryDate', 'dboName', 'premiseName', 'category', 'contacts', 'validationPeriod', 'county', 'location'];
      for (const field of required) {
        const value = formData[field as keyof FormData];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          missing.push(field);
        }
      }

      if (missing.length > 0) {
        setFailedFields(prev => Array.from(new Set([...prev, ...missing])));
        const firstFieldLabel = missing[0].replace(/([A-Z])/g, ' $1').toLowerCase();
        setStatus({ type: 'error', message: `Please fill in all general information fields (missing: ${firstFieldLabel}).` });
        return false;
      }
    } else if (s === 2) {
      if (formData.category === 'CP>5,000 L/D' || formData.category === 'CP<5,000 L/D' || formData.category === 'Processor') {
        formData.intakes.forEach((intake, idx) => {
          if (!intake.month) missing.push(`intake-${idx}-month`);
          if (!intake.year) missing.push(`intake-${idx}-year`);
          if (!intake.quantity || intake.quantity.trim() === '') missing.push(`intake-${idx}-quantity`);
          if (!intake.farmerPrice || intake.farmerPrice.trim() === '') missing.push(`intake-${idx}-farmerPrice`);
          if (!intake.processor || intake.processor.trim() === '') missing.push(`intake-${idx}-processor`);
          if (!intake.processorPrice || intake.processorPrice.trim() === '') missing.push(`intake-${idx}-processorPrice`);
        });
      }
      if (formData.hasLocalSales) {
        formData.sales.forEach((sale, idx) => {
          if (!sale.month) missing.push(`sale-${idx}-month`);
          if (!sale.year) missing.push(`sale-${idx}-year`);
          if (!sale.qtyDeclared || sale.qtyDeclared.trim() === '') missing.push(`sale-${idx}-qtyDeclared`);
          if (!sale.verifiedQty || sale.verifiedQty.trim() === '') missing.push(`sale-${idx}-verifiedQty`);
          if (!sale.projectedQty || sale.projectedQty.trim() === '') missing.push(`sale-${idx}-projectedQty`);
          if (!sale.buyingPrice || sale.buyingPrice.trim() === '') missing.push(`sale-${idx}-buyingPrice`);
          if (!sale.sellingPrice || sale.sellingPrice.trim() === '') missing.push(`sale-${idx}-sellingPrice`);
        });
      }
      if (formData.natureOfProduce.length === 0) {
        missing.push('natureOfProduce');
      }
      if (!formData.source || formData.source.trim() === '') {
        missing.push('source');
      }

      if (missing.length > 0) {
        setFailedFields(prev => Array.from(new Set([...prev, ...missing])));
        if (missing.includes('natureOfProduce')) {
          setStatus({ type: 'error', message: 'Please select at least one nature of produce.' });
        } else if (missing.includes('source')) {
          setStatus({ type: 'error', message: 'Please fill in the source field.' });
        } else if (missing.some(m => m.startsWith('intake-'))) {
          setStatus({ type: 'error', message: 'Please complete all fields in the monthly intake section.' });
        } else if (missing.some(m => m.startsWith('sale-'))) {
          setStatus({ type: 'error', message: 'Please complete all fields in the local sales section.' });
        } else {
          setStatus({ type: 'error', message: 'Please complete all required fields.' });
        }
        return false;
      }
    }

    setFailedFields(prev => prev.filter(f => {
      if (s === 1) {
        const required = ['branch', 'date', 'permitNo', 'expiryDate', 'dboName', 'premiseName', 'category', 'contacts', 'validationPeriod', 'county', 'location'];
        return !required.includes(f);
      }
      if (s === 2) {
        return f.startsWith('intake-') || f.startsWith('sale-') || f === 'natureOfProduce' || f === 'source';
      }
      return true;
    }));
    setStatus({ type: null, message: '' });
    return true;
  };

  const handleStart = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setFormData(prev => ({ 
      ...prev, 
      startTime: timeStr,
      date: getLocalDate()
    }));
    setStep(1);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };

  const generatePDF = async (data: FormData = formData) => {
    const doc = new jsPDF();
    let currentY = 130;

    // Helper to load image
    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
      });
    };

    try {
      const logo = await loadImage(KDB_LOGO_URL);
      // Center the logo (x, y, width, height)
      doc.addImage(logo, 'PNG', 85, 10, 40, 25);
    } catch (e) {
      console.error("Could not load KDB logo for PDF", e);
    }

    const checkPageBreak = (neededHeight: number) => {
      if (currentY + neededHeight > 275) {
        doc.addPage();
        currentY = 20;
        return true;
      }
      return false;
    };

    const writeField = (label: string, value: string, x: number, y: number) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, x, y);
      const labelWidth = doc.getTextWidth(label);
      doc.setFont("helvetica", "normal");
      doc.text(` ${value || ''}`, x + labelWidth, y);
    };
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Data Validation Form", 105, 45, { align: "center" });
    doc.setLineWidth(0.5);
    doc.line(45, 47, 165, 47);
    doc.setFont("helvetica", "normal");
    
    doc.setFontSize(10);
    writeField("Branch:", data.branch, 20, 65);
    writeField("Date:", formatDate(data.date), 20, 73);
    writeField("Start Time:", data.startTime, 20, 81);
    writeField("End Time:", data.endTime, 20, 89);
    
    writeField("Dairy Business Operator (DBO) Name:", data.dboName, 20, 101);
    writeField("Premise Name:", data.premiseName, 20, 109);
    writeField("Category:", data.category, 20, 117);
    writeField("Permit No:", data.permitNo, 110, 117);
    writeField("Contacts:", data.contacts, 20, 125);
    writeField("Expiry Date:", formatDate(data.expiryDate), 110, 125);
    writeField("Location:", data.location, 20, 133);
    writeField("County:", data.county, 110, 133);
    writeField("Validation Period:", data.validationPeriod, 20, 141);

    currentY = 150;

    // Intakes Table
    if (data.category === 'CP>5,000 L/D' || data.category === 'CP<5,000 L/D' || data.category === 'Processor') {
      checkPageBreak(25);
      doc.setFontSize(12);
      doc.text("Total Monthly Intakes", 20, currentY);
      autoTable(doc, {
        startY: currentY + 5,
        head: [['Month/Year', 'Qty', 'Farmer Price', 'Processor', 'Proc. Price', 'Avg Collection/Day']],
        body: data.intakes.map(i => [`${i.month} ${i.year}`, i.quantity, i.farmerPrice, i.processor, i.processorPrice, i.avgVolPerDay]),
        styles: { fontSize: 8 }
      });
      currentY = (doc as any).lastAutoTable.finalY;
      currentY += 10;
    }

    // Sales Table
    if (data.hasLocalSales) {
      checkPageBreak(25);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Local Sales Data", 20, currentY);
      doc.setFont("helvetica", "normal");
      autoTable(doc, {
        startY: currentY + 5,
        head: [['Month/Year', 'Declared', 'Verified', 'Projected', 'Under Declared', 'Buying Price', 'Selling Price', 'Avg Vol/Day']],
        body: data.sales.map(s => [`${s.month} ${s.year}`, s.qtyDeclared, s.verifiedQty, s.projectedQty, s.underDeclared, s.buyingPrice, s.sellingPrice, s.avgVolPerDay]),
        styles: { fontSize: 7 }
      });
      currentY = (doc as any).lastAutoTable.finalY;
      currentY += 10;
    }

    // Summary Data
    checkPageBreak(35);
    autoTable(doc, {
      startY: currentY + 5,
      head: [['Detail', 'Value']],
      body: [
        ['Are Traceability & Records Available', data.traceability],
        ['Nature of Produce?', data.natureOfProduce.join(', ')],
        ['Source', data.source],
      ],
      styles: { fontSize: 8 }
    });
    currentY = (doc as any).lastAutoTable.finalY;
    currentY += 10;

    // Compliance Section
    checkPageBreak(25);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Compliance Commitment:", 20, currentY);
    doc.setFont("helvetica", "normal");
    
    if (data.nonCompliance.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(0, 128, 0); // Green
      doc.text("No under-declaration was witnessed.", 20, currentY + 7);
      doc.setTextColor(0, 0, 0); // Reset to black
      currentY += 15;
    } else {
      autoTable(doc, {
        startY: currentY + 5,
        head: [['CSL Period (Month/Year)', 'Litres', 'Amount (Kshs)', 'Month/Year to Pay', 'MPESA REF']],
        body: [
          ...data.nonCompliance.map(nc => [nc.month, nc.litres, nc.amount, nc.paymentMonthYear, nc.mpesaRef]),
          [{ content: 'TOTAL', styles: { fontStyle: 'bold' } }, '', { content: totalPenalty.toFixed(2), styles: { fontStyle: 'bold' } }, '', '']
        ],
        styles: { fontSize: 8 }
      });
      currentY = (doc as any).lastAutoTable.finalY;
      currentY += 10;
    }

    if (data.comments) {
      checkPageBreak(25);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Comments:", 20, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(data.comments, 20, currentY + 5, { maxWidth: 170 });
      currentY += 20;
    }

    // Declarations
    checkPageBreak(45);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Declarations:", 20, currentY);
    doc.setFont("helvetica", "normal");
    currentY += 7;
    const declarationTexts = [
      "I/We confirm that the information provided is true and accurate to the best of my/our knowledge.",
      "I/We understand that under-declaration of milk volumes is an offense under the Dairy Industry Act.",
      "I/We agree to pay the calculated penalty amounts within the specified periods.",
      "I/We confirm that I/We have been informed/presented with, read and understood the KDB Premise Inspection Scope Disclosure, including the legal obligations to maintain records and traceability of the same as stipulated under the Dairy Industry Act (Cap 336), Laws of Kenya."
    ];
    declarationTexts.forEach((text, i) => {
      const splitText = doc.splitTextToSize(text, 164);
      const itemHeight = Math.max(splitText.length * 5.5, 7);
      checkPageBreak(itemHeight + 3);
      
      doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}.`, 20, currentY);
      
      doc.setFont("helvetica", "normal");
      doc.text(splitText, 26, currentY);
      
      currentY += itemHeight + 2;
    });
    currentY += 3;

    // Signatures
    checkPageBreak(45);
    doc.setFontSize(11);
    doc.text(`Compliance Officer: ${data.complianceOfficer}`, 20, currentY);
    if (data.complianceSignature && data.complianceSignature.startsWith('data:image')) {
      try {
        const format = data.complianceSignature.includes('png') ? 'PNG' : 'JPEG';
        doc.addImage(data.complianceSignature, format, 20, currentY + 2, 40, 15);
      } catch (e) {
        console.error('Error adding compliance signature:', e);
      }
    }
    
    doc.text(`For DBO; Name: ${data.confirmationName} (${data.designation})`, 110, currentY);
    if (data.dboSignature && data.dboSignature.startsWith('data:image')) {
      try {
        const format = data.dboSignature.includes('png') ? 'PNG' : 'JPEG';
        doc.addImage(data.dboSignature, format, 110, currentY + 2, 40, 15);
      } catch (e) {
        console.error('Error adding DBO signature:', e);
      }
    }
    if (data.dboStamp && data.dboStamp.startsWith('data:image')) {
      try {
        const format = data.dboStamp.includes('png') ? 'PNG' : 'JPEG';
        doc.addImage(data.dboStamp, format, 110, currentY + 18, 40, 15);
      } catch (e) {
        console.error('Error adding DBO stamp:', e);
      }
    }

    return doc.output('datauristring');
  };

  const handlePreview = async () => {
    const pdf = await generatePDF();
    setPdfPreview(pdf);
  };

  const viewPdf = async (path: string) => {
    if (!supabase) return;
    // Create a signed URL that expires in 60 seconds for security
    const { data, error } = await supabase.storage
      .from('validation-pdfs')
      .createSignedUrl(path, 60);
    
    if (error) {
      console.error('Error creating signed URL:', error);
      return;
    }

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  const dataURIToBlob = (dataURI: string) => {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: null, message: '' });

    // Validation
    if (!isConnected) {
      setStatus({ type: 'error', message: 'Google Sheets integration is not configured. Please check your environment variables.' });
      setIsSubmitting(false);
      return;
    }
    if (!validateStep(1) || !validateStep(2)) {
      setIsSubmitting(false);
      return;
    }
    if (!formData.complianceOfficer || !formData.complianceSignature || !formData.confirmationName || !formData.designation || !formData.dboSignature) {
      setStatus({ type: 'error', message: 'Please complete all signature fields before submitting.' });
      setIsSubmitting(false);
      return;
    }
    if (!declarations.accurate || !declarations.offense || !declarations.agreement || !declarations.awareness) {
      setStatus({ type: 'error', message: 'Please check all declaration boxes below before submitting.' });
      setIsSubmitting(false);
      return;
    }

    // Duplicate check
    const isDuplicate = lastCollections.some(c => c.fullPeriod.toLowerCase() === formData.validationPeriod.toLowerCase());
    if (isDuplicate) {
      setStatus({ type: 'error', message: `Data for ${formData.validationPeriod} has already been collected for this Premise. Please verify the validation period.` });
      setIsSubmitting(false);
      return;
    }

    try {
      const endTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const updatedData = { ...formData, endTime };
      setFormData(updatedData);

      const pdf = await generatePDF(updatedData);

      // 1. Submit to Supabase (New)
      if (supabase) {
        try {
          // Upload PDF to Supabase Storage
          let pdfPath = null;
          try {
            const pdfBlob = dataURIToBlob(pdf);
            const fileName = `${updatedData.premiseName.replace(/\s+/g, '_')}_${updatedData.validationPeriod.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('validation-pdfs')
              .upload(fileName, pdfBlob, {
                contentType: 'application/pdf',
                upsert: false
              });
            
            if (uploadError) {
              console.error('Supabase PDF upload error:', uploadError);
            } else {
              pdfPath = uploadData.path;
            }
          } catch (uploadErr) {
            console.error('PDF upload process failed:', uploadErr);
          }

          const { error: supabaseError } = await supabase
            .from('kdb_validations')
            .insert([{
              dbo_name: updatedData.dboName,
              premise_name: updatedData.premiseName,
              branch: updatedData.branch,
              date: updatedData.date,
              validation_period: updatedData.validationPeriod,
              category: updatedData.category,
              permit_no: updatedData.permitNo,
              location: updatedData.location,
              county: updatedData.county,
              total_penalty: totalPenalty,
              pdf_path: pdfPath, // Store the reference to the file
              raw_data: updatedData // Store full JSON for backup
            }]);
          
          if (supabaseError) console.error('Supabase save error:', supabaseError);
        } catch (err) {
          console.error('Supabase integration failed:', err);
        }
      }

      // 2. Submit to Google Sheets (Original)
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: updatedData, pdf }),
      });

      if (res.ok) {
        setStatus({ type: 'success', message: 'Data successfully synced! Your PDF is downloading...' });
        
        // Trigger PDF Download
        const link = document.createElement('a');
        link.href = pdf;
        link.download = `KDB_Validation_${formData.dboName}_${formData.date}.pdf`;
        link.click();

        // Clear local storage draft and manual override edits
        localStorage.removeItem('kdb_validation_form_draft');
        setIsValidationPeriodEdited(false);

        setFormData(initialData);
        setStep(0); // Go back to start
      } else {
        const error: any = await res.json();
        throw new Error(error.error || 'Submission failed');
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories = [
    'CP>5,000 L/D', 'CP<5,000 L/D', 'Cottage Industry', 'Milk Bar', 
    'Mini Dairy', 'Dispenser', 'Processor'
  ];

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = ['2025', '2026', '2027'];

  const dboSigPad = useRef<SignatureCanvas>(null);

  const compressImage = (base64: string, maxWidth = 800, maxHeight = 800, transparent = false): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (!transparent) {
            // Fill with white background to avoid black background on JPEGs with transparency
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
          }
          ctx.drawImage(img, 0, 0, width, height);
        }
        resolve(canvas.toDataURL(transparent ? 'image/png' : 'image/jpeg', 0.8));
      };
      img.onerror = () => resolve(base64); // Fallback
    });
  };

  const extractStamp = (base64: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Calculate brightness
          const brightness = (r + g + b) / 3;
          
          // If the pixel is bright (white-ish background), make it transparent
          // We use a threshold to remove shadows on paper
          if (brightness > 170) {
            data[i + 3] = 0; 
          } else {
            // Ensure the ink is fully opaque and slightly enhanced
            data[i + 3] = 255;
            // Optional: darken dark pixels to make stamp crisper
            if (brightness < 100) {
              data[i] = Math.max(0, r - 20);
              data[i+1] = Math.max(0, g - 20);
              data[i+2] = Math.max(0, b - 20);
            }
          }
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(base64);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'complianceSignature' | 'dboSignature' | 'dboStamp') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        let result = reader.result as string;
        if (field === 'dboStamp') {
          // First extract the stamp (remove background)
          result = await extractStamp(result);
          // Then compress/resize while keeping transparency
          const processed = await compressImage(result, 800, 800, true);
          setFormData(prev => ({ ...prev, [field]: processed }));
        } else {
          const compressed = await compressImage(result);
          setFormData(prev => ({ ...prev, [field]: compressed }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearField = (field: 'complianceSignature' | 'dboSignature' | 'dboStamp') => {
    setFormData(prev => ({ ...prev, [field]: '' }));
  };

  const saveDboSignature = async () => {
    if (dboSigPad.current && !dboSigPad.current.isEmpty()) {
      const sigData = dboSigPad.current.getTrimmedCanvas().toDataURL('image/png');
      const compressed = await compressImage(sigData);
      setFormData(prev => ({ ...prev, dboSignature: compressed }));
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f4] text-[#1a1a1a] font-sans p-2 md:p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-4 text-center">
          <div className="flex justify-center mb-2">
            <div className="bg-white p-2 md:p-3 rounded-xl shadow-sm border border-black/5 flex items-center gap-2">
              <Database className="w-6 h-6 text-blue-600" />
              <h1 className="text-xl font-bold tracking-tight uppercase">Kenya Dairy Board</h1>
            </div>
          </div>
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">Data Validation Form</p>
        </header>

        {/* Draft Restore Alert */}
        <AnimatePresence>
          {hasDraft && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-4 overflow-hidden"
              id="draft-restore-alert"
            >
              <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                    <FileText className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Unsaved Data Found</p>
                    <p className="text-xs text-amber-700 font-medium">You have an unfinished validation draft. Would you like to restore it?</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 sm:mt-0 self-end sm:self-auto shrink-0">
                  <button
                    onClick={handleRestoreDraft}
                    className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1"
                    id="restore-draft-btn"
                  >
                    Restore Draft
                  </button>
                  <button
                    onClick={handleDiscardDraft}
                    className="px-3 py-1.5 rounded-lg border border-amber-200 bg-white hover:bg-amber-100 text-amber-700 text-[11px] font-bold transition-all cursor-pointer"
                    id="discard-draft-btn"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Status Message */}
        <AnimatePresence>
          {status.message && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className={`p-4 rounded-xl flex items-center gap-3 border ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
              }`}>
                {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <p className="text-sm font-medium">{status.message}</p>
                <button onClick={() => setStatus({ type: null, message: '' })} className="ml-auto text-gray-400 hover:text-gray-600">
                  &times;
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Connection Status */}
        <div className="mb-4 bg-white rounded-xl p-4 shadow-sm border border-black/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <div>
                <p className="text-xs font-semibold">Google Sheets Sync</p>
                <p className="text-[10px] text-gray-500">{isConnected ? 'Service Account Active' : 'Credentials Missing'}</p>
              </div>
            </div>
            {isConnected && (
              <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Ready to Sync</span>
              </div>
            )}
          </div>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-2xl shadow-lg border border-black/5 overflow-hidden">
          {/* Progress Bar */}
          <div className="h-1.5 w-full bg-gray-100">
            <motion.div 
              className="h-full bg-blue-600"
              initial={{ width: '0%' }}
              animate={{ width: `${(step / 3) * 100}%` }}
            />
          </div>

          <form onSubmit={handleSubmit} className="p-8">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="start"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-12 space-y-6"
                >
                  <ClipboardCheck className="w-20 h-20 text-blue-600" />
                  <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2">Ready to start validation?</h2>
                    <p className="text-gray-500">Click the button below to begin the data collection process.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStart}
                    className="px-12 py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:bg-blue-700 transition-all active:scale-95"
                  >
                    Start New Validation
                  </button>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">1</div>
                    <h2 className="text-lg font-bold">General Information</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Branch</label>
                      <input
                        type="text"
                        name="branch"
                        value={formData.branch}
                        onChange={handleChange}
                        className={getInputClass('branch')}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</label>
                        <input
                          type="date"
                          name="date"
                          value={formData.date}
                          onChange={handleChange}
                          className={getInputClass('date')}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Start Time</label>
                        <input
                          type="text"
                          name="startTime"
                          readOnly
                          value={formData.startTime}
                          className="w-full px-4 py-2 rounded-xl border border-gray-100 bg-gray-50 text-gray-500 outline-none text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Permit No</label>
                      <input
                        type="text"
                        name="permitNo"
                        placeholder="KDB / ..."
                        value={formData.permitNo}
                        onChange={handleChange}
                        className={getInputClass('permitNo')}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Expiry Date</label>
                      <input
                        type="date"
                        name="expiryDate"
                        value={formData.expiryDate}
                        onChange={handleChange}
                        className={getInputClass('expiryDate')}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Name of DBO</label>
                      <input
                        type="text"
                        name="dboName"
                        value={formData.dboName}
                        onChange={handleChange}
                        className={getInputClass('dboName')}
                        placeholder="Enter DBO name..."
                      />
                      {isCheckingDbo && (
                        <p className="text-[10px] text-blue-500 font-medium mt-1 flex items-center gap-1 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Checking previous validations...
                        </p>
                      )}
                      
                      <AnimatePresence>
                        {lastDboRecords.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-2 p-3 bg-emerald-50/70 rounded-xl border border-emerald-100 space-y-2 overflow-hidden"
                          >
                            <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-tight flex items-center gap-1">
                              <Database className="w-3.5 h-3.5 text-emerald-600" />
                              Previous Validations Found: Click to Autofill
                            </p>
                            <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1">
                              {lastDboRecords.map((record, index) => {
                                const raw = record.raw_data || {};
                                const premise = record.premise_name || 'Unknown Premise';
                                const category = record.category || 'Unknown';
                                const location = record.location || 'Unknown';
                                const pNo = record.permit_no || 'N/A';
                                
                                return (
                                  <button
                                    key={index}
                                    type="button"
                                    onClick={() => handleDboAutofill(record)}
                                    className="w-full text-left p-2 rounded-lg bg-white border border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-[11px] group flex flex-col gap-0.5"
                                  >
                                    <div className="flex justify-between items-center w-full">
                                      <span className="font-bold text-gray-800 group-hover:text-emerald-900 truncate">
                                        {premise}
                                      </span>
                                      <span className="text-[9px] font-mono text-emerald-700 bg-emerald-100/50 px-1.5 py-0.5 rounded-md">
                                        {category}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-gray-500 flex justify-between items-center mt-0.5">
                                      <span>Permit: {pNo} | Loc: {location}</span>
                                      <span className="text-[9px] text-gray-400 font-mono italic">
                                        {new Date(record.date).toLocaleDateString('default', { month: 'short', year: 'numeric' })}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {lastCollections.length > 0 && (() => {
                        const latest = lastCollections[0].fullPeriod;
                        const parts = latest.split(' ');
                        if (parts.length >= 2) {
                          const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                          const monthIndex = months.indexOf(parts[0]);
                          if (monthIndex !== -1) {
                            let nextMonthIndex = monthIndex + 1;
                            let nextYear = parseInt(parts[1]);
                            if (nextMonthIndex > 11) {
                              nextMonthIndex = 0;
                              nextYear += 1;
                            }
                            return (
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight mt-1 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Next month to validate: {months[nextMonthIndex]} {nextYear}
                              </p>
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Premise Name</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="premiseName"
                          value={formData.premiseName}
                          onChange={handleChange}
                          className={getInputClass('premiseName', 'pr-10')}
                          placeholder="Type premise name to check history..."
                        />
                        {isCheckingHistory && (
                          <div className="absolute right-3 top-2.5">
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                          </div>
                        )}
                      </div>
                      
                      {/* History Banner */}
                      <AnimatePresence>
                        {historyError && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-2 p-2 bg-red-50 text-red-600 rounded-lg border border-red-100 text-[10px] flex items-center gap-1.5"
                          >
                            <AlertCircle className="w-3 h-3" />
                            {historyError}
                          </motion.div>
                        )}
                        {lastCollections.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-2 p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-2"
                          >
                            <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                            <div>
                                <p className="text-[11px] font-bold text-blue-800 uppercase tracking-tight">
                                  Recent History for {lastCollections[0]?.matchedPremise || formData.premiseName}
                                </p>
                                <div className="text-[10px] text-blue-600 mt-1 flex flex-wrap gap-x-2 gap-y-1">
                                  Last 3 validated months: {lastCollections.map((c, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                      <span className="font-semibold">{c.displayString}</span>
                                      {c.pdfPath && (
                                        <button
                                          onClick={() => viewPdf(c.pdfPath!)}
                                          className="text-[9px] bg-blue-100 hover:bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors"
                                          title="View PDF"
                                        >
                                          <FileText className="w-2.5 h-2.5" />
                                          PDF
                                        </button>
                                      )}
                                      {i < lastCollections.length - 1 && <span className="text-blue-300">|</span>}
                                    </div>
                                  ))}
                                </div>
                            </div>
                          </motion.div>
                        )}
                        {!isCheckingHistory && formData.premiseName.length >= 3 && lastCollections.length === 0 && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 text-[10px] font-medium flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            No previous records found for this Premise.
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</label>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, category: cat }));
                          setFailedFields(prev => prev.filter(f => f !== 'category'));
                        }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                          formData.category === cat 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                            : `bg-white text-gray-600 hover:border-blue-300 ${failedFields.includes('category') ? 'border-red-500 bg-red-50/20 ring-2 ring-red-100' : 'border-gray-200'}`
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contacts</label>
                      <input
                        type="text"
                        name="contacts"
                        value={formData.contacts}
                        onChange={handleChange}
                        className={getInputClass('contacts')}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Validation Period</label>
                      <input
                        type="text"
                        name="validationPeriod"
                        value={formData.validationPeriod}
                        onChange={handleChange}
                        className={getInputClass('validationPeriod')}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">County</label>
                      <input
                        type="text"
                        name="county"
                        value={formData.county}
                        onChange={handleChange}
                        className={getInputClass('county', '', 'px-4 py-2 rounded-xl text-xs')}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Location</label>
                      <input
                        type="text"
                        name="location"
                        value={formData.location}
                        onChange={handleChange}
                        className={getInputClass('location', '', 'px-4 py-2 rounded-xl text-xs')}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      onClick={() => validateStep(1) && setStep(2)}
                      className="flex items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all"
                    >
                      Next Step
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">2</div>
                    <h2 className="text-lg font-bold">Volume & Sales Data</h2>
                  </div>

                  {/* Dynamic Intake Section - Conditional based on category */}
                  {(formData.category === 'CP>5,000 L/D' || formData.category === 'CP<5,000 L/D' || formData.category === 'Processor') && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-blue-600 uppercase text-xs tracking-widest">Total Monthly Intake</h3>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, intakes: [...prev.intakes, { month: '', year: new Date().getFullYear().toString(), quantity: '', farmerPrice: '', processor: '', processorPrice: '', avgVolPerDay: '' }] }))}
                          className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          + Add Month
                        </button>
                      </div>
                      
                      {formData.intakes.map((intake, idx) => (
                        <div key={idx} className="p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-4 relative">
                          {idx > 0 && (
                            <button 
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, intakes: prev.intakes.filter((_, i) => i !== idx) }))}
                              className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
                            >
                              &times;
                            </button>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Month</label>
                              <select
                                value={intake.month}
                                onChange={(e) => {
                                  const newIntakes = [...formData.intakes];
                                  newIntakes[idx].month = e.target.value;
                                  setFormData(prev => ({ ...prev, intakes: newIntakes }));
                                  setFailedFields(prev => prev.filter(f => f !== `intake-${idx}-month`));
                                }}
                                className={`w-full px-3 py-1.5 rounded-lg border outline-none text-[11px] bg-white transition-all ${
                                  failedFields.includes(`intake-${idx}-month`)
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20'
                                    : 'border-gray-200 focus:border-blue-500'
                                }`}
                              >
                                {months.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Year</label>
                              <select
                                value={intake.year}
                                onChange={(e) => {
                                  const newIntakes = [...formData.intakes];
                                  newIntakes[idx].year = e.target.value;
                                  setFormData(prev => ({ ...prev, intakes: newIntakes }));
                                  setFailedFields(prev => prev.filter(f => f !== `intake-${idx}-year`));
                                }}
                                className={`w-full px-3 py-1.5 rounded-lg border outline-none text-[11px] bg-white transition-all ${
                                  failedFields.includes(`intake-${idx}-year`)
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20'
                                    : 'border-gray-200 focus:border-blue-500'
                                }`}
                              >
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Quantity (Litres)</label>
                              <input
                                placeholder="0.00"
                                value={intake.quantity}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const newIntakes = [...formData.intakes];
                                  newIntakes[idx].quantity = val;
                                  // Formula: Quantity / 30
                                  const num = parseFloat(val);
                                  if (!isNaN(num)) {
                                    newIntakes[idx].avgVolPerDay = (num / 30).toFixed(2);
                                  }
                                  setFormData(prev => ({ ...prev, intakes: newIntakes }));
                                  setFailedFields(prev => prev.filter(f => f !== `intake-${idx}-quantity`));
                                }}
                                className={`w-full px-3 py-1.5 rounded-lg border outline-none text-[11px] transition-all ${
                                  failedFields.includes(`intake-${idx}-quantity`)
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20'
                                    : 'border-gray-200 focus:border-blue-500'
                                }`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Farmer Price (Kshs)</label>
                              <input
                                placeholder="0.00"
                                value={intake.farmerPrice}
                                onChange={(e) => {
                                  const newIntakes = [...formData.intakes];
                                  newIntakes[idx].farmerPrice = e.target.value;
                                  setFormData(prev => ({ ...prev, intakes: newIntakes }));
                                  setFailedFields(prev => prev.filter(f => f !== `intake-${idx}-farmerPrice`));
                                }}
                                className={`w-full px-3 py-1.5 rounded-lg border outline-none text-[11px] transition-all ${
                                  failedFields.includes(`intake-${idx}-farmerPrice`)
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20'
                                    : 'border-gray-200 focus:border-blue-500'
                                }`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Processor</label>
                              <input
                                placeholder="Name"
                                value={intake.processor}
                                onChange={(e) => {
                                  const newIntakes = [...formData.intakes];
                                  newIntakes[idx].processor = e.target.value;
                                  setFormData(prev => ({ ...prev, intakes: newIntakes }));
                                  setFailedFields(prev => prev.filter(f => f !== `intake-${idx}-processor`));
                                }}
                                className={`w-full px-3 py-1.5 rounded-lg border outline-none text-[11px] transition-all ${
                                  failedFields.includes(`intake-${idx}-processor`)
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20'
                                    : 'border-gray-200 focus:border-blue-500'
                                }`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Processor Price (Kshs)</label>
                              <input
                                placeholder="0.00"
                                value={intake.processorPrice}
                                onChange={(e) => {
                                  const newIntakes = [...formData.intakes];
                                  newIntakes[idx].processorPrice = e.target.value;
                                  setFormData(prev => ({ ...prev, intakes: newIntakes }));
                                  setFailedFields(prev => prev.filter(f => f !== `intake-${idx}-processorPrice`));
                                }}
                                className={`w-full px-3 py-1.5 rounded-lg border outline-none text-[11px] transition-all ${
                                  failedFields.includes(`intake-${idx}-processorPrice`)
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20'
                                    : 'border-gray-200 focus:border-blue-500'
                                }`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Average Collection/Day (Litres/Kgs)</label>
                              <input
                                placeholder="0.00"
                                value={intake.avgVolPerDay}
                                onChange={(e) => {
                                  const newIntakes = [...formData.intakes];
                                  newIntakes[idx].avgVolPerDay = e.target.value;
                                  setFormData(prev => ({ ...prev, intakes: newIntakes }));
                                }}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 outline-none text-[11px] bg-gray-50 font-bold text-blue-600"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {/* Merged Local Sales Section */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-blue-600 uppercase text-xs tracking-widest">Local Sales Data</h3>
                        {(formData.category === 'CP>5,000 L/D' || formData.category === 'CP<5,000 L/D' || formData.category === 'Processor') && (
                          <label className="flex items-center gap-2 cursor-pointer bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                            <input
                              type="checkbox"
                              checked={formData.hasLocalSales}
                              onChange={(e) => setFormData(prev => ({ ...prev, hasLocalSales: e.target.checked }))}
                              className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-[10px] font-bold text-blue-700 uppercase">Has Local Sales?</span>
                          </label>
                        )}
                      </div>
                      {formData.hasLocalSales && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, sales: [...prev.sales, { 
                            month: '', 
                            year: new Date().getFullYear().toString(),
                            qtyDeclared: '', 
                            verifiedQty: '', 
                            projectedQty: '', 
                            underDeclared: '0', 
                            buyingPrice: '', 
                            sellingPrice: '', 
                            avgVolPerDay: '' 
                          }] }))}
                          className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          + Add Month
                        </button>
                      )}
                    </div>

                    {!formData.hasLocalSales ? (
                      <div className="p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center">
                        <p className="text-sm text-gray-500 italic">Local sales section is locked/disabled for this entity.</p>
                      </div>
                    ) : (
                      formData.sales.map((sale, idx) => (
                        <div key={idx} className="p-6 bg-white rounded-2xl border border-gray-200 space-y-4 relative shadow-sm">
                        {idx > 0 && (
                          <button 
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, sales: prev.sales.filter((_, i) => i !== idx) }))}
                            className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
                          >
                            &times;
                          </button>
                        )}
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Month</label>
                            <select
                              value={sale.month}
                              onChange={(e) => {
                                const newSales = [...formData.sales];
                                newSales[idx].month = e.target.value;
                                setFormData(prev => ({ ...prev, sales: newSales }));
                                setFailedFields(prev => prev.filter(f => f !== `sale-${idx}-month`));
                              }}
                              className={`w-full px-3 py-1.5 rounded-xl border outline-none text-[11px] font-bold appearance-none bg-white transition-all ${
                                failedFields.includes(`sale-${idx}-month`)
                                  ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20 text-red-600'
                                  : 'border-blue-100 focus:border-blue-500 text-blue-600'
                              }`}
                            >
                              {months.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Year</label>
                            <select
                              value={sale.year}
                              onChange={(e) => {
                                const newSales = [...formData.sales];
                                newSales[idx].year = e.target.value;
                                setFormData(prev => ({ ...prev, sales: newSales }));
                                setFailedFields(prev => prev.filter(f => f !== `sale-${idx}-year`));
                              }}
                              className={`w-full px-3 py-1.5 rounded-xl border outline-none text-[11px] font-bold appearance-none bg-white transition-all ${
                                failedFields.includes(`sale-${idx}-year`)
                                  ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20 text-red-600'
                                  : 'border-blue-100 focus:border-blue-500 text-blue-600'
                              }`}
                            >
                              {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="p-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Details</th>
                                <th className="p-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Unit</th>
                                <th className="p-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Value</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {[
                                { label: 'Quantity Declared', name: 'qtyDeclared', unit: 'Litres' },
                                { label: 'Witnessed/Verified Quantity', name: 'verifiedQty', unit: 'Litres' },
                                { label: 'Projected Quantity for Month', name: 'projectedQty', unit: 'Litres' },
                                { label: 'Under Declared Volume (Auto)', name: 'underDeclared', unit: 'Litres', readOnly: true },
                                { label: 'Buying Price (Per Records)', name: 'buyingPrice', unit: 'Kshs' },
                                { label: 'Selling Price (Per Records)', name: 'sellingPrice', unit: 'Kshs' },
                                { label: 'Avg Volume per Day', name: 'avgVolPerDay', unit: 'Litres' },
                              ].map((row) => (
                                <tr key={row.name}>
                                  <td className="p-3 text-xs font-medium text-gray-700">{row.label}</td>
                                  <td className="p-3 text-[10px] text-gray-400">{row.unit}</td>
                                  <td className="p-1">
                                    <input
                                      type="text"
                                      readOnly={row.readOnly}
                                      value={(sale as any)[row.name]}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const newSales = [...formData.sales];
                                        (newSales[idx] as any)[row.name] = val;
                                        
                                        // Mirror qtyDeclared to verifiedQty, but allow independent edit
                                        if (row.name === 'qtyDeclared') {
                                          newSales[idx].verifiedQty = val;
                                          const num = parseFloat(val);
                                          if (!isNaN(num)) {
                                            newSales[idx].avgVolPerDay = (num / 30).toFixed(2);
                                          }
                                          // Clear both from failedFields
                                          setFailedFields(prev => prev.filter(f => f !== `sale-${idx}-qtyDeclared` && f !== `sale-${idx}-verifiedQty`));
                                        } else {
                                          // Clear current from failedFields
                                          setFailedFields(prev => prev.filter(f => f !== `sale-${idx}-${row.name}`));
                                        }
                                        
                                        // Formula for Avg Volume per Day based on Verified Quantity
                                        if (row.name === 'verifiedQty') {
                                          const num = parseFloat(val);
                                          if (!isNaN(num)) {
                                            newSales[idx].avgVolPerDay = (num / 30).toFixed(2);
                                          }
                                        }
                                        
                                        setFormData(prev => ({ ...prev, sales: newSales }));
                                      }}
                                      className={`w-full px-3 py-1.5 rounded-lg border outline-none text-xs transition-all ${
                                        row.readOnly || row.name === 'avgVolPerDay' 
                                          ? 'bg-gray-50 border-gray-50 text-blue-600 font-bold' 
                                          : failedFields.includes(`sale-${idx}-${row.name}`)
                                            ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20 text-red-600 font-bold'
                                            : 'border-gray-50 focus:border-blue-500'
                                      }`}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Traceability & Records Available</label>
                      <div className="flex gap-4">
                        {['YES', 'NO'].map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, traceability: opt }))}
                            className={`flex-1 py-2 rounded-xl border font-bold text-xs transition-all ${
                              formData.traceability === opt 
                                ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                                : 'bg-white border-gray-200 text-gray-600'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                     <div className={`space-y-2 p-2.5 rounded-2xl transition-all ${failedFields.includes('natureOfProduce') ? 'bg-red-50/50 border border-red-300 ring-2 ring-red-100' : 'border border-transparent'}`}>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nature of Produce?</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Pasteurized Milk', 'Raw Milk', 'Cultured Milk', 'Yoghurt'].map(opt => (
                          <label key={opt} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={formData.natureOfProduce.includes(opt)}
                              onChange={(e) => {
                                const newProduce = e.target.checked 
                                  ? [...formData.natureOfProduce, opt]
                                  : formData.natureOfProduce.filter(p => p !== opt);
                                setFormData(prev => ({ ...prev, natureOfProduce: newProduce }));
                                setFailedFields(prev => prev.filter(f => f !== 'natureOfProduce'));
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-[11px] text-gray-600 group-hover:text-gray-900 transition-colors">{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Source</label>
                      <input
                        type="text"
                        name="source"
                        value={formData.source}
                        onChange={handleChange}
                        className={`w-full px-4 py-2 rounded-xl border outline-none text-xs transition-all ${
                          failedFields.includes('source')
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-200 ring-2 ring-red-100 bg-red-50/20'
                            : 'border-gray-200 focus:border-blue-500'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex items-center gap-2 px-8 py-3 text-gray-500 font-bold hover:text-black transition-all"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => validateStep(2) && setStep(3)}
                      className="flex items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all"
                    >
                      Next Step
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">3</div>
                    <h2 className="text-lg font-bold">Compliance & Confirmation</h2>
                  </div>

                  <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 space-y-4">
                    <div className="overflow-x-auto rounded-xl border border-blue-100">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-blue-100/50">
                            <th className="p-3 text-[10px] font-bold text-blue-600 uppercase tracking-wider">CSL Period</th>
                            <th className="p-3 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Litres</th>
                            <th className="p-3 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Amount (Kshs)</th>
                            <th className="p-3 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Month/Year to Pay</th>
                            <th className="p-3 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Paid/MPESA REF No:</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-50">
                          {formData.nonCompliance.map((nc, idx) => (
                            <tr key={idx}>
                              <td className="p-3 text-xs font-bold text-blue-800">{nc.month}</td>
                              <td className="p-3 text-xs text-blue-700">{nc.litres}</td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  placeholder="0.00"
                                  value={nc.amount}
                                  onChange={(e) => {
                                    const newNC = [...formData.nonCompliance];
                                    newNC[idx].amount = e.target.value;
                                    setFormData(prev => ({ ...prev, nonCompliance: newNC }));
                                  }}
                                  className="w-full px-3 py-1.5 rounded-lg border border-blue-100 outline-none text-xs font-mono"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  placeholder="MM/YYYY"
                                  value={nc.paymentMonthYear}
                                  onChange={(e) => {
                                    const newNC = [...formData.nonCompliance];
                                    newNC[idx].paymentMonthYear = e.target.value;
                                    setFormData(prev => ({ ...prev, nonCompliance: newNC }));
                                  }}
                                  className="w-full px-3 py-1.5 rounded-lg border border-blue-100 outline-none text-xs"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  placeholder="REF NO"
                                  value={nc.mpesaRef}
                                  onChange={(e) => {
                                    const newNC = [...formData.nonCompliance];
                                    newNC[idx].mpesaRef = e.target.value;
                                    setFormData(prev => ({ ...prev, nonCompliance: newNC }));
                                  }}
                                  className="w-full px-3 py-1.5 rounded-lg border border-blue-100 outline-none text-xs"
                                />
                              </td>
                            </tr>
                          ))}
                          {formData.nonCompliance.length > 0 && (
                            <tr className="bg-blue-50/50">
                              <td className="p-3 text-xs font-bold text-blue-900">TOTAL</td>
                              <td className="p-3 text-xs text-blue-700"></td>
                              <td className="p-3 text-xs font-bold text-blue-900">
                                {totalPenalty.toFixed(2)}
                              </td>
                              <td colSpan={2}></td>
                            </tr>
                          )}
                          {formData.nonCompliance.length === 0 && (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-xs text-blue-400 italic">No under-declaration detected.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-gray-100 space-y-4">
                    <h3 className="text-sm font-bold text-gray-900">Declarations</h3>
                    <div className="space-y-3">
                      {/* Accept All Declarations */}
                      <label className="flex items-center gap-3 cursor-pointer group pb-3 border-b border-gray-100">
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={declarations.accurate && declarations.offense && declarations.agreement && declarations.awareness}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setDeclarations({
                                accurate: val,
                                offense: val,
                                agreement: val,
                                awareness: val
                              });
                            }}
                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-emerald-600 checked:bg-emerald-600"
                          />
                          <CheckCircle2 className="absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 left-0.5" />
                        </div>
                        <span className="text-xs font-bold text-gray-800 leading-relaxed group-hover:text-emerald-700 transition-colors">
                          Accept All Declarations
                        </span>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group pt-1">
                        <div className="relative flex items-center mt-0.5">
                          <input
                            type="checkbox"
                            checked={declarations.accurate}
                            onChange={(e) => setDeclarations(prev => ({ ...prev, accurate: e.target.checked }))}
                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-blue-600 checked:bg-blue-600"
                          />
                          <CheckCircle2 className="absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 left-0.5" />
                        </div>
                        <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-900 transition-colors">
                          I/We confirm that the information provided is true and accurate to the best of my/our knowledge.
                        </span>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative flex items-center mt-0.5">
                          <input
                            type="checkbox"
                            checked={declarations.offense}
                            onChange={(e) => setDeclarations(prev => ({ ...prev, offense: e.target.checked }))}
                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-blue-600 checked:bg-blue-600"
                          />
                          <CheckCircle2 className="absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 left-0.5" />
                        </div>
                        <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-900 transition-colors">
                          I/We understand that under-declaration of milk volumes is an offense under the Dairy Industry Act.
                        </span>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative flex items-center mt-0.5">
                          <input
                            type="checkbox"
                            checked={declarations.agreement}
                            onChange={(e) => setDeclarations(prev => ({ ...prev, agreement: e.target.checked }))}
                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-blue-600 checked:bg-blue-600"
                          />
                          <CheckCircle2 className="absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 left-0.5" />
                        </div>
                        <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-900 transition-colors">
                          I/We agree to pay the calculated penalty amounts within the specified periods.
                        </span>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative flex items-center mt-0.5">
                          <input
                            type="checkbox"
                            checked={declarations.awareness}
                            onChange={(e) => setDeclarations(prev => ({ ...prev, awareness: e.target.checked }))}
                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-blue-600 checked:bg-blue-600"
                          />
                          <CheckCircle2 className="absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 left-0.5" />
                        </div>
                        <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-900 transition-colors">
                          I/We confirm that I/We have been informed/presented with, read and understood the KDB Premise Inspection Scope Disclosure, including the legal obligations to maintain records and traceability of the same as stipulated under the Dairy Industry Act (Cap 336), Laws of Kenya.
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Comments</label>
                    <textarea
                      name="comments"
                      value={formData.comments}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 outline-none text-sm"
                      placeholder="Enter any additional comments here..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Compliance Officer Name</label>
                        <input
                          type="text"
                          name="complianceOfficer"
                          value={formData.complianceOfficer}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Compliance Officer Signature</label>
                        <div className="flex flex-col gap-2">
                          {!formData.complianceSignature ? (
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleFileChange(e, 'complianceSignature')}
                              className="text-xs"
                            />
                          ) : (
                            <div className="relative group">
                              <img src={formData.complianceSignature} alt="Compliance Signature" className="h-20 object-contain border rounded-lg bg-white" />
                              <button
                                type="button"
                                onClick={() => clearField('complianceSignature')}
                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">For DBO; Name</label>
                        <input
                          type="text"
                          name="confirmationName"
                          value={formData.confirmationName}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Designation</label>
                        <input
                          type="text"
                          name="designation"
                          value={formData.designation}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">DBO Signature</label>
                        <div className="flex flex-col gap-2">
                          {!formData.dboSignature ? (
                            <div className="space-y-3">
                              <div className="border-2 border-dashed border-gray-200 rounded-xl p-2 bg-gray-50">
                                <SignatureCanvas
                                  ref={dboSigPad}
                                  penColor="black"
                                  canvasProps={{
                                    className: "w-full h-32 rounded-lg cursor-crosshair",
                                    style: { background: 'white' }
                                  }}
                                />
                                <div className="flex justify-between mt-2">
                                  <button
                                    type="button"
                                    onClick={() => dboSigPad.current?.clear()}
                                    className="text-[10px] font-bold text-gray-500 hover:text-red-500 flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" /> Clear Pad
                                  </button>
                                  <button
                                    type="button"
                                    onClick={saveDboSignature}
                                    className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                  >
                                    <PenTool className="w-3 h-3" /> Save Signature
                                  </button>
                                </div>
                              </div>
                              <div className="text-center">
                                <span className="text-[10px] text-gray-400 uppercase font-bold">OR UPLOAD IMAGE</span>
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileChange(e, 'dboSignature')}
                                className="text-xs"
                              />
                            </div>
                          ) : (
                            <div className="relative group">
                              <img src={formData.dboSignature} alt="DBO Signature" className="h-20 object-contain border rounded-lg bg-white" />
                              <button
                                type="button"
                                onClick={() => clearField('dboSignature')}
                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">DBO Stamp</label>
                        <div className="flex flex-col gap-2">
                          {!formData.dboStamp ? (
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleFileChange(e, 'dboStamp')}
                              className="text-xs"
                            />
                          ) : (
                            <div className="relative group">
                              <img src={formData.dboStamp} alt="DBO Stamp" className="h-20 object-contain border rounded-lg bg-white" />
                              <button
                                type="button"
                                onClick={() => clearField('dboStamp')}
                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 pt-6">
                    <div className="flex justify-between items-center">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="flex items-center gap-2 px-6 py-3 text-gray-500 font-bold hover:text-black transition-all"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={handlePreview}
                          className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
                        >
                          <FileText className="w-4 h-4" />
                          Preview PDF
                        </button>
                      </div>
                      
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`flex items-center gap-2 px-10 py-4 rounded-2xl font-bold transition-all shadow-lg ${
                          isSubmitting
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                        }`}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Syncing & Generating PDF...
                          </>
                        ) : (
                          <>
                            <Save className="w-5 h-5" />
                            Submit & Sync to Sheet
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>

        {/* PDF Preview Modal */}
        <AnimatePresence>
          {pdfPreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-5xl h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl"
              >
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
                  <h3 className="text-xl font-bold">PDF Preview</h3>
                  <button
                    onClick={() => setPdfPreview(null)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    &times;
                  </button>
                </div>
                <div className="flex-1 bg-gray-100">
                  <iframe
                    src={pdfPreview}
                    className="w-full h-full border-none"
                    title="PDF Preview"
                  />
                </div>
                <div className="p-6 border-t border-gray-100 flex justify-end bg-white">
                  <button
                    onClick={() => setPdfPreview(null)}
                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
                  >
                    Close Preview
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-12 text-center text-gray-400 text-[10px] uppercase tracking-widest pb-8">
          &copy; {new Date().getFullYear()} Kenya Dairy Board &bull; Quality Milk for Health and Wealth
        </footer>
      </div>
    </div>
  );
}
