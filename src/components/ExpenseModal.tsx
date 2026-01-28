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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">{expense ? 'Edit Expense' : 'Add Expense'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-neutral-100 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Description *</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Amount *</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none">
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none">
              <option value="">Select category</option>
              <option value="Travel">Travel</option>
              <option value="Meals">Meals</option>
              <option value="Software">Software</option>
              <option value="Equipment">Equipment</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="billable" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="rounded border-neutral-300 text-neutral-500 focus:ring-[#476E66]" />
            <label htmlFor="billable" className="text-sm text-neutral-700">Billable to client</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Attach Receipt</label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.pdf"
              className="hidden"
            />
            {receiptPreview ? (
              <div className="relative border border-neutral-200 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  {receiptPreview.startsWith('data:image') ? (
                    <img src={receiptPreview} alt="Receipt" className="w-16 h-16 object-cover rounded-lg" />
                  ) : (
                    <div className="w-16 h-16 bg-neutral-100 rounded-lg flex items-center justify-center">
                      <Paperclip className="w-6 h-6 text-neutral-500" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-700">{receiptFile?.name || 'Receipt attached'}</p>
                    <p className="text-xs text-neutral-500">{receiptFile ? `${(receiptFile.size / 1024).toFixed(1)} KB` : ''}</p>
                  </div>
                  <button type="button" onClick={removeReceipt} className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-500 hover:text-neutral-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-3 border-2 border-dashed border-neutral-300 rounded-xl hover:border-neutral-900-400 hover:bg-[#3A5B54]-50 transition-colors flex items-center justify-center gap-2 text-neutral-600"
              >
                <Upload className="w-5 h-5" />
                <span>Click to upload receipt</span>
              </button>
            )}
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} onClick={(e) => { e.preventDefault(); handleSubmit(e as any); }} className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : expense ? 'Update' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
