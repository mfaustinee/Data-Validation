import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle2, FileText, Loader2, Save, AlertCircle } from 'lucide-react';

export default function DairyForm() {
  const initialFormData = {
    dboName: '',
    premiseName: '',
    email: '',
    category: '',
    contacts: '',
    validationPeriod: '',
    location: '',
    intakes: [],
    sales: [],
    traceability: '',
    natureOfProduce: '',
    source: '',
    nonCompliance: [],
    comments: '',
    complianceOfficer: '',
    complianceSignature: '',
    confirmationName: '',
    designation: '',
    dboSignature: '',
  };

  const [formData, setFormData] = useState(initialFormData);
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [declarations, setDeclarations] = useState({
    accurate: false,
    offense: false,
    agreement: false,
    awareness: false,
  });

  // Example options
  const categories = ['CP>5,000 L/D', 'CP<5,000 L/D', 'Processor', 'Other'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const years = Array.from({ length: 10 }, (_, i) => `${2023 + i}`);

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: keyof typeof formData) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Total penalty (example, sum of nonCompliance amounts)
  const totalPenalty = formData.nonCompliance.reduce((acc, nc) => acc + Number(nc.amount || 0), 0);

  // Handle PDF preview
  const handlePreview = () => {
    // Implement your PDF generation logic
    // Example placeholder URL:
    setPdfPreview('https://example.com/placeholder.pdf');
  };

  // Submit handler (without EmailJS)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Replace with your Google Sheets append function
      await appendToSheet(formData);

      setStatus({ type: 'success', message: 'Data synced successfully!' });
      setFormData(initialFormData);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to sync data.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Example stub for Google Sheets sync
  const appendToSheet = async (data: typeof formData) => {
    // Implement your API call or Google Apps Script here
    return new Promise<void>(resolve => setTimeout(resolve, 1000));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow-xl p-8">
        <form onSubmit={handleSubmit}>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                {/* Step 1 Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">DBO Name</label>
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
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Client Email (for copy)</label>
                    <input
                      type="email"
                      name="email"
                      placeholder="client@example.com"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
                    />
                  </div>
                </div>

                {/* Category */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, category: cat }))}
                        className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${
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

                {/* More fields */}
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
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Location</label>
                    <input
                      type="text"
                      name="location"
                      value={formData.location}
                      onChange={handleChange}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
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

            {/* Step 2 & Step 3 sections remain mostly unchanged */}
            {/* You can copy your existing Step 2 & Step 3 code here, just remove any emailjs references */}

          </AnimatePresence>

          {/* Submit button now only syncs to Google Sheets */}
          <div className="flex justify-end pt-6">
            <button
              type="submit"
              disabled={isSubmitting || !declarations.accurate || !declarations.offense || !declarations.agreement || !declarations.awareness}
              className={`flex items-center gap-2 px-10 py-4 rounded-2xl font-bold transition-all shadow-lg ${
                isSubmitting || !declarations.accurate || !declarations.offense || !declarations.agreement || !declarations.awareness
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Submit & Sync to Sheet
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}