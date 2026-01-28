import { useState, useRef } from 'react';
import { X, Paperclip, Upload } from 'lucide-react';
import { api, Project, Expense } from '../lib/api';

interface ExpenseModalProps {
  expense: Expense | null;
  projects: Project[];
  companyId: string;
  userId: string;
  defaultProjectId?: string;
  onClose: () => void;
  onSave: () => void;
}

export function ExpenseModal({ expense, projects, companyId, userId, defaultProjectId, onClose, onSave }: ExpenseModalProps) {
  const [description, setDescription] = useState(expense?.description || '');
  const [projectId, setProjectId] = useState(expense?.project_id || defaultProjectId || '');
  const [amount, setAmount] = useState(expense?.amount?.toString() || '');
  const [category, setCategory] = useState(expense?.category || '');
  const [date, setDate] = useState(expense?.date?.split('T')[0] || new Date().toISOString().split('T')[0]);
  const [billable, setBillable] = useState(expense?.billable ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setReceiptPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;
    setError(null);
    setSaving(true);
    try {
      let receiptUrl = expense?.receipt_url;
      
      // Upload receipt if a new file is selected
      if (receiptFile) {
        receiptUrl = await api.uploadReceipt(receiptFile, companyId);
      }
      
      const data = {
        description,
        project_id: projectId || null,
        amount: parseFloat(amount),
        category: category || null,
        date,
        billable,
        receipt_url: receiptUrl,
        status: 'pending' as const,
      };
      if (expense) {
        await api.updateExpense(expense.id, data);
      } else {
        await api.createExpense({ ...data, company_id: companyId, user_id: userId });
      }
      onSave();
    } catch (err: any) {
      console.error('Failed to save expense:', err);
      setError(err?.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md sm:mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b border-neutral-100">
          <h2 className="text-lg font-semibold text-neutral-900">{expense ? 'Edit Expense' : 'Add Expense'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">{error}</div>}
          
          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Description *</label>
            <input 
              type="text" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder="What was this expense for?"
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none" 
              required 
            />
          </div>
          
          {/* Amount & Date - Side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
                <input 
                  type="number" 
                  step="0.01" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none" 
                  required 
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Date *</label>
              <input 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)} 
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none" 
                required 
              />
            </div>
          </div>
          
          {/* Project & Category - Side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Project</label>
              <select 
                value={projectId} 
                onChange={(e) => setProjectId(e.target.value)} 
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none bg-white"
              >
                <option value="">None</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Category</label>
              <select 
                value={category} 
                onChange={(e) => setCategory(e.target.value)} 
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none bg-white"
              >
                <option value="">Select</option>
                <option value="Travel">Travel</option>
                <option value="Meals">Meals</option>
                <option value="Software">Software</option>
                <option value="Equipment">Equipment</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          
          {/* Billable Toggle */}
          <label className="flex items-center gap-2 py-1 cursor-pointer">
            <input 
              type="checkbox" 
              checked={billable} 
              onChange={(e) => setBillable(e.target.checked)} 
              className="w-4 h-4 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66]" 
            />
            <span className="text-sm text-neutral-700">Billable to client</span>
          </label>
          
          {/* Receipt Upload - Compact */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.pdf"
              className="hidden"
            />
            {receiptPreview ? (
              <div className="flex items-center gap-3 p-2 border border-neutral-200 rounded-lg bg-neutral-50">
                {receiptPreview.startsWith('data:image') ? (
                  <img src={receiptPreview} alt="Receipt" className="w-10 h-10 object-cover rounded" />
                ) : (
                  <div className="w-10 h-10 bg-neutral-200 rounded flex items-center justify-center">
                    <Paperclip className="w-4 h-4 text-neutral-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-neutral-700 truncate">{receiptFile?.name || 'Receipt'}</p>
                  <p className="text-[10px] text-neutral-500">{receiptFile ? `${(receiptFile.size / 1024).toFixed(0)} KB` : ''}</p>
                </div>
                <button type="button" onClick={removeReceipt} className="p-1 hover:bg-neutral-200 rounded text-neutral-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-3 py-2 border border-dashed border-neutral-300 rounded-lg hover:border-[#476E66] hover:bg-[#476E66]/5 transition-colors flex items-center justify-center gap-2 text-neutral-500 text-sm"
              >
                <Upload className="w-4 h-4" />
                <span>Attach receipt (optional)</span>
              </button>
            )}
          </div>
          
          {/* Action Buttons - Sticky bottom */}
          <div className="flex gap-2 pt-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 px-4 py-2.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={saving || !description || !amount} 
              className="flex-1 px-4 py-2.5 text-sm bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50 font-medium"
            >
              {saving ? 'Saving...' : expense ? 'Update' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
