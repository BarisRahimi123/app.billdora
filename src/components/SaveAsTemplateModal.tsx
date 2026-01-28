import { useState, useEffect } from 'react';
import { X, Tag, Users, FileText, Plus } from 'lucide-react';
import { api, ProposalTemplate } from '../lib/api';

interface SaveAsTemplateModalProps {
  companyId: string;
  templateData: ProposalTemplate['template_data'];
  onSave: (template: ProposalTemplate) => void;
  onClose: () => void;
}

export default function SaveAsTemplateModal({ companyId, templateData, onSave, onClose }: SaveAsTemplateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [clientType, setClientType] = useState('');
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [existingClientTypes, setExistingClientTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewClientType, setShowNewClientType] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newClientType, setNewClientType] = useState('');

  useEffect(() => {
    loadExistingCategories();
  }, [companyId]);

  async function loadExistingCategories() {
    try {
      const data = await api.getTemplateCategories(companyId);
      setExistingCategories(data.categories);
      setExistingClientTypes(data.clientTypes);
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Please enter a template name');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const finalCategory = showNewCategory ? newCategory.trim() : category;
      const finalClientType = showNewClientType ? newClientType.trim() : clientType;

      const template = await api.createProposalTemplate({
        company_id: companyId,
        name: name.trim(),
        description: description.trim() || undefined,
        category: finalCategory || undefined,
        client_type: finalClientType || undefined,
        template_data: templateData
      });

      onSave(template);
    } catch (err: any) {
      console.error('Failed to save template:', err);
      setError(err?.message || 'Failed to save template');
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#476E66]/10 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#476E66]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Save as Template</h2>
              <p className="text-sm text-neutral-500">Reuse this proposal for future projects</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Template Name */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Template Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Residential Renovation Package"
              className="w-full px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of when to use this template..."
              rows={2}
              className="w-full px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              <Tag className="w-4 h-4 inline mr-1" />
              Category
            </label>
            {showNewCategory ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category name"
                  className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  autoFocus
                />
                <button
                  onClick={() => { setShowNewCategory(false); setNewCategory(''); }}
                  className="px-3 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none bg-white"
                >
                  <option value="">Select category...</option>
                  {existingCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewCategory(true)}
                  className="px-3 py-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 rounded-lg flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  New
                </button>
              </div>
            )}
          </div>

          {/* Client Type */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              <Users className="w-4 h-4 inline mr-1" />
              Client Type
            </label>
            {showNewClientType ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newClientType}
                  onChange={(e) => setNewClientType(e.target.value)}
                  placeholder="New client type"
                  className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                  autoFocus
                />
                <button
                  onClick={() => { setShowNewClientType(false); setNewClientType(''); }}
                  className="px-3 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={clientType}
                  onChange={(e) => setClientType(e.target.value)}
                  className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none bg-white"
                >
                  <option value="">Select client type...</option>
                  {existingClientTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewClientType(true)}
                  className="px-3 py-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 rounded-lg flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  New
                </button>
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-xl text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
