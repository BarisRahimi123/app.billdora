import { useState, useEffect } from 'react';
import { X, Search, FileText, FolderOpen, Clock, Tag, Users, ChevronDown } from 'lucide-react';
import { api, ProposalTemplate } from '../lib/api';

interface TemplatePickerModalProps {
  companyId: string;
  onSelect: (template: ProposalTemplate) => void;
  onClose: () => void;
}

export default function TemplatePickerModal({ companyId, onSelect, onClose }: TemplatePickerModalProps) {
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedClientType, setSelectedClientType] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [clientTypes, setClientTypes] = useState<string[]>([]);

  useEffect(() => {
    loadTemplates();
  }, [companyId]);

  async function loadTemplates() {
    try {
      const [templatesData, categoriesData] = await Promise.all([
        api.getProposalTemplates(companyId),
        api.getTemplateCategories(companyId)
      ]);
      setTemplates(templatesData);
      setCategories(categoriesData.categories);
      setClientTypes(categoriesData.clientTypes);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
    setLoading(false);
  }

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    const matchesClientType = selectedClientType === 'all' || t.client_type === selectedClientType;
    return matchesSearch && matchesCategory && matchesClientType;
  });

  const handleSelect = async (template: ProposalTemplate) => {
    try {
      await api.incrementTemplateUseCount(template.id);
    } catch (e) {
      // Non-critical, continue
    }
    onSelect(template);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Choose Template</h2>
            <p className="text-sm text-neutral-500 mt-1">Select a template to start your proposal</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b space-y-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none text-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {categories.length > 0 && (
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 border border-neutral-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                >
                  <option value="all">All Categories</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
              </div>
            )}
            {clientTypes.length > 0 && (
              <div className="relative">
                <select
                  value={selectedClientType}
                  onChange={(e) => setSelectedClientType(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 border border-neutral-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#476E66] focus:border-transparent outline-none"
                >
                  <option value="all">All Client Types</option>
                  {clientTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {/* Templates List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-[#476E66] border-t-transparent rounded-full"></div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-neutral-500 font-medium">No templates found</p>
              <p className="text-neutral-400 text-sm mt-1">
                {templates.length === 0 
                  ? "Create your first template by saving a proposal"
                  : "Try adjusting your filters"}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredTemplates.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="w-full p-4 border border-neutral-200 rounded-xl hover:border-[#476E66] hover:bg-[#476E66]/5 transition-all text-left group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-[#476E66]/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-[#476E66]/20 transition-colors">
                      <FileText className="w-5 h-5 text-[#476E66]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-neutral-900 truncate">{template.name}</h3>
                      {template.description && (
                        <p className="text-sm text-neutral-500 mt-0.5 line-clamp-2">{template.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-neutral-400">
                        {template.category && (
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {template.category}
                          </span>
                        )}
                        {template.client_type && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {template.client_type}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Used {template.use_count}x
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Start from Scratch
          </button>
        </div>
      </div>
    </div>
  );
}
