import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  Save
} from 'lucide-react';

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
  // Dynamic sections
  intakes: IntakeEntry[];
  sales: SalesEntry[];
  nonCompliance: NonComplianceEntry[];
  comments: string;
}

const initialData: FormData = {
  branch: 'KERICHO',
  date: new Date().toISOString().split('T')[0],
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
  county: 'KERICHO',
  traceability: 'YES',
  natureOfProduce: [],
  source: '',
  complianceOfficer: '',
  complianceSignature: '',
  confirmationName: '',
  dboSignature: '',
  dboStamp: '',
  designation: '',
  intakes: [{ month: 'January', year: '2025', quantity: '', farmerPrice: '', processor: '', processorPrice: '', avgVolPerDay: '' }],
  sales: [{ 
    month: new Date().toLocaleString('default', { month: 'long' }), 
    year: '2025',
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
  const [declarations, setDeclarations] = useState({
    accurate: false,
    offense: false,
    agreement: false,
    awareness: false
  });

  useEffect(() => {
    // Auto calculate under declared volume for each sales entry
    const updatedSales = formData.sales.map(sale => {
      const declared = parseFloat(sale.qtyDeclared) || 0;
      const verified = parseFloat(sale.verifiedQty) || 0;
      const diff = Math.max(0, verified - declared);
      return { ...sale, underDeclared: diff.toString() };
    });

    // Auto populate non-compliance based on under-declaration
    const newNonCompliance = updatedSales
      .filter(sale => parseFloat(sale.underDeclared) > 0 && sale.month.trim() !== '')
      .map(sale => {
        const displayMonth = `${sale.month} ${sale.year}`;
        // Find existing entry to preserve paymentMonthYear and mpesaRef
        const existing = formData.nonCompliance.find(nc => nc.month === displayMonth);
        
        return {
          month: displayMonth,
          litres: sale.underDeclared,
          amount: (parseFloat(sale.underDeclared) * (parseFloat(sale.buyingPrice) || 0) / 100 * 1.25).toFixed(2),
          paymentMonthYear: existing?.paymentMonthYear || '',
          mpesaRef: existing?.mpesaRef || ''
        };
      });

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
          const data = await res.json();
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleStart = () => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setFormData(prev => ({ ...prev, startTime: now }));
    setStep(1);
  };

  const generatePDF = async (data: FormData = formData) => {
    const doc = new jsPDF();
    let currentY = 90;

    const checkPageBreak = (neededHeight: number) => {
      if (currentY + neededHeight > 275) {
        doc.addPage();
        currentY = 20;
        return true;
      }
      return false;
    };
    
    doc.setFontSize(18);
    doc.text("Kenya Dairy Board - Data Validation Form", 105, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Branch: ${data.branch}`, 20, 35);
    doc.text(`Date: ${data.date}`, 20, 40);
    doc.text(`Start Time: ${data.startTime}`, 20, 45);
    doc.text(`End Time: ${data.endTime}`, 20, 50);
    
    doc.text(`DBO Name: ${data.dboName}`, 20, 60);
    doc.text(`Premise Name: ${data.premiseName}`, 20, 65);
    doc.text(`Contacts: ${data.contacts}`, 20, 75);
    doc.text(`County: ${data.county}`, 110, 75);
    doc.text(`Location: ${data.location}`, 20, 80);

    // Intakes Table
    if (data.category === 'CP>5,000 L/D' || data.category === 'CP<5,000 L/D' || data.category === 'Processor') {
      checkPageBreak(25);
      doc.setFontSize(12);
      doc.text("Total Monthly Intakes", 20, currentY);
      autoTable(doc, {
        startY: currentY + 5,
        head: [['Month/Year', 'Qty', 'Farmer Price', 'Processor', 'Proc. Price', 'Avg Collection/Day']],
        body: data.intakes.map(i => [`${i.month} ${i.year}`, i.quantity, i.farmerPrice, i.processor, i.processorPrice, i.avgVolPerDay]),
        styles: { fontSize: 8 },
        didDrawPage: (data) => {
          currentY = data.cursor.y;
        }
      });
      currentY += 10;
    }

    // Sales Table
    checkPageBreak(25);
    doc.setFontSize(12);
    doc.text("Local Sales Data", 20, currentY);
    data.sales.forEach((sale, idx) => {
      checkPageBreak(45);
      doc.setFontSize(10);
      doc.text(`Period: ${sale.month} ${sale.year}`, 20, currentY + 7);
      autoTable(doc, {
        startY: currentY + 10,
        head: [['Detail', 'Unit', 'Value']],
        body: [
          ['Quantity Declared', 'Litres', sale.qtyDeclared],
          ['Verified Quantity', 'Litres', sale.verifiedQty],
          ['Projected Quantity', 'Litres', sale.projectedQty],
          ['Under Declared', 'Litres', sale.underDeclared],
          ['Buying Price', 'Kshs', sale.buyingPrice],
          ['Selling Price', 'Kshs', sale.sellingPrice],
          ['Avg Volume/Day', 'Litres', sale.avgVolPerDay],
        ],
        margin: { left: 25 },
        styles: { fontSize: 8 },
        didDrawPage: (data) => {
          currentY = data.cursor.y;
        }
      });
      currentY += 5;
    });
    currentY += 5;

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
      styles: { fontSize: 8 },
      didDrawPage: (data) => {
        currentY = data.cursor.y;
      }
    });
    currentY += 10;

    // Compliance Section
    checkPageBreak(25);
    doc.setFontSize(12);
    doc.text("Compliance Commitment", 20, currentY);
    
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
        styles: { fontSize: 8 },
        didDrawPage: (data) => {
          currentY = data.cursor.y;
        }
      });
      currentY += 10;
    }

    if (data.comments) {
      checkPageBreak(25);
      doc.setFontSize(11);
      doc.text("Comments:", 20, currentY);
      doc.text(data.comments, 20, currentY + 5, { maxWidth: 170 });
      currentY += 20;
    }

    // Declarations
    checkPageBreak(45);
    doc.setFontSize(11);
    doc.text("Declarations:", 20, currentY);
    currentY += 5;
    const declarationText = [
      "- I/We confirm that the information provided is true and accurate to the best of my/our knowledge.",
      "- I/We understand that under-declaration of milk volumes is an offense under the Dairy Industry Act.",
      "- I/We agree to pay the calculated penalty amounts within the specified periods.",
      "- I/We confirm that I/We have been informed/presented with, read and understood the Client Awareness on Data Validation & Reconciliation scope, including the legal obligations to maintain records and traceability of the same as stipulated under the Dairy Industry Act (Cap 336), Laws of Kenya."
    ];
    declarationText.forEach(text => {
      const splitText = doc.splitTextToSize(text, 170);
      checkPageBreak(splitText.length * 6);
      doc.text(splitText, 20, currentY);
      currentY += splitText.length * 6;
    });
    currentY += 5;

    // Signatures
    checkPageBreak(45);
    doc.setFontSize(11);
    doc.text(`Compliance Officer: ${data.complianceOfficer}`, 20, currentY);
    if (data.complianceSignature) {
      doc.addImage(data.complianceSignature, 'PNG', 20, currentY + 2, 40, 15);
    }
    
    doc.text(`For DBO; Name: ${data.confirmationName} (${data.designation})`, 110, currentY);
    if (data.dboSignature) {
      doc.addImage(data.dboSignature, 'PNG', 110, currentY + 2, 40, 15);
    }
    if (data.dboStamp) {
      doc.addImage(data.dboStamp, 'PNG', 110, currentY + 18, 40, 15);
    }

    return doc.output('datauristring');
  };

  const handlePreview = async () => {
    const pdf = await generatePDF();
    setPdfPreview(pdf);
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
    if (!declarations.accurate || !declarations.offense || !declarations.agreement || !declarations.awareness) {
      setStatus({ type: 'error', message: 'Please check all declaration boxes below before submitting.' });
      setIsSubmitting(false);
      return;
    }

    try {
      const endTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const updatedData = { ...formData, endTime };
      setFormData(updatedData);

      const pdf = await generatePDF(updatedData);

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

        setFormData(initialData);
        setStep(0); // Go back to start
      } else {
        const error = await res.json();
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

  const years = ['2025', '2026'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'complianceSignature' | 'dboSignature' | 'dboStamp') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
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
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
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
                          className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
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
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Expiry Date</label>
                      <input
                        type="date"
                        name="expiryDate"
                        value={formData.expiryDate}
                        onChange={handleChange}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Name of DBO</label>
                      <input
                        type="text"
                        name="dboName"
                        value={formData.dboName}
                        onChange={handleChange}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Premise Name</label>
                      <input
                        type="text"
                        name="premiseName"
                        value={formData.premiseName}
                        onChange={handleChange}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</label>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, category: cat }))}
                        className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                          formData.category === cat 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
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
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Validation Period</label>
                      <input
                        type="text"
                        name="validationPeriod"
                        value={formData.validationPeriod}
                        onChange={handleChange}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">County</label>
                      <input
                        type="text"
                        name="county"
                        value={formData.county}
                        onChange={handleChange}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Location</label>
                      <input
                        type="text"
                        name="location"
                        value={formData.location}
                        onChange={handleChange}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
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
                          onClick={() => setFormData(prev => ({ ...prev, intakes: [...prev.intakes, { month: '', quantity: '', farmerPrice: '', processor: '', processorPrice: '', avgVolPerDay: '' }] }))}
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
                                }}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 outline-none text-[11px] bg-white"
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
                                }}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 outline-none text-[11px] bg-white"
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
                                }}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 outline-none text-[11px]"
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
                                }}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 outline-none text-[11px]"
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
                                }}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 outline-none text-[11px]"
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
                                }}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 outline-none text-[11px]"
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
                      <h3 className="font-bold text-blue-600 uppercase text-xs tracking-widest">Local Sales Data</h3>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, sales: [...prev.sales, { 
                          month: '', 
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
                    </div>

                    {formData.sales.map((sale, idx) => (
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
                              }}
                              className="w-full px-3 py-1.5 rounded-xl border border-blue-100 focus:border-blue-500 outline-none text-[11px] font-bold text-blue-600 appearance-none bg-white"
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
                              }}
                              className="w-full px-3 py-1.5 rounded-xl border border-blue-100 focus:border-blue-500 outline-none text-[11px] font-bold text-blue-600 appearance-none bg-white"
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
                                        
                                        // Formula for Avg Volume per Day based on Verified Quantity
                                        if (row.name === 'verifiedQty') {
                                          const num = parseFloat(val);
                                          if (!isNaN(num)) {
                                            newSales[idx].avgVolPerDay = (num / 30).toFixed(2);
                                          }
                                        }
                                        
                                        setFormData(prev => ({ ...prev, sales: newSales }));
                                      }}
                                      className={`w-full px-3 py-1.5 rounded-lg border outline-none text-xs ${row.readOnly || row.name === 'avgVolPerDay' ? 'bg-gray-50 border-gray-50 text-blue-600 font-bold' : 'border-gray-50 focus:border-blue-500'}`}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
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
                    <div className="space-y-2">
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
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 outline-none text-xs"
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
                      onClick={() => setStep(3)}
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
                              <td className="p-3 text-xs font-mono text-blue-700">{nc.amount}</td>
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
                      <label className="flex items-start gap-3 cursor-pointer group">
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
                          I/We confirm that I/We have been informed/presented with, read and understood the Client Awareness on Data Validation & Reconciliation scope, including the legal obligations to maintain records and traceability of the same as stipulated under the Dairy Industry Act (Cap 336), Laws of Kenya.
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
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, 'complianceSignature')}
                            className="text-xs"
                          />
                          {formData.complianceSignature && (
                            <img src={formData.complianceSignature} alt="Compliance Signature" className="h-20 object-contain border rounded-lg bg-white" />
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
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, 'dboSignature')}
                            className="text-xs"
                          />
                          {formData.dboSignature && (
                            <img src={formData.dboSignature} alt="DBO Signature" className="h-20 object-contain border rounded-lg bg-white" />
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">DBO Stamp</label>
                        <div className="flex flex-col gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, 'dboStamp')}
                            className="text-xs"
                          />
                          {formData.dboStamp && (
                            <img src={formData.dboStamp} alt="DBO Stamp" className="h-20 object-contain border rounded-lg bg-white" />
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
