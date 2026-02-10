import { useEffect, useState, useRef } from 'react';
import { Camera, Upload, Image as ImageIcon, X, Check, Link2, RefreshCw, Trash2, Eye } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useToast } from '../components/Toast';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Receipt {
  id: string;
  company_id: string;
  user_id: string;
  image_url: string;
  vendor: string | null;
  amount: number | null;
  receipt_date: string | null;
  category: string | null;
  matched_transaction_id: string | null;
  notes: string | null;
  created_at: string;
}

export default function ReceiptsPage() {
  const { profile } = useAuth();
  const { isAdmin, canViewFinancials } = usePermissions();
  const { showToast } = useToast();

  if (!isAdmin && !canViewFinancials) {
    return (
      <div className="p-12 text-center">
        <p className="text-neutral-500 text-lg font-medium">Access Restricted</p>
        <p className="text-neutral-400 text-sm mt-2">You don't have permission to view receipts. Contact your administrator.</p>
      </div>
    );
  }
  const [searchParams] = useSearchParams();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [showScanner, setShowScanner] = useState(searchParams.get('scan') === '1');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.company_id) {
      loadReceipts();
    }
  }, [profile?.company_id]);

  const loadReceipts = async () => {
    if (!profile?.company_id) return;
    try {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setReceipts(data || []);
    } catch (err) {
      console.error('Failed to load receipts:', err);
      showToast('Failed to load receipts', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Compress image before upload (prevents iOS camera freeze)
  const compressImage = async (file: File, maxWidth = 1200, quality = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Scale down if larger than maxWidth
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile?.company_id) return;

    setUploading(true);
    try {
      // Compress image to prevent freeze on iOS (large camera photos)
      let uploadFile: File | Blob = file;
      if (file.type.startsWith('image/') && file.size > 500000) { // Compress if > 500KB
        console.log(`[Receipts] Compressing image from ${(file.size / 1024 / 1024).toFixed(2)}MB`);
        uploadFile = await compressImage(file);
        console.log(`[Receipts] Compressed to ${(uploadFile.size / 1024 / 1024).toFixed(2)}MB`);
      }
      
      // Upload to Supabase Storage
      const fileName = `${profile.company_id}/${Date.now()}_${file.name.replace(/\.[^/.]+$/, '')}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, uploadFile, {
          contentType: 'image/jpeg',
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);

      // Try to call parse-receipt edge function with timeout
      const { data: { session } } = await supabase.auth.getSession();
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      let parseSuccess = false;
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-receipt`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              image_url: publicUrl,
              company_id: profile.company_id,
              user_id: profile.id,
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          if (!result.error) {
            parseSuccess = true;
          }
        }
      } catch (parseError: any) {
        clearTimeout(timeoutId);
        console.warn('[Receipts] Parse failed or timed out:', parseError.message);
        // Continue - we'll save the receipt anyway
      }
      
      // If parsing failed, save the receipt directly without parsed data
      if (!parseSuccess) {
        const { error: insertError } = await supabase
          .from('receipts')
          .insert({
            company_id: profile.company_id,
            user_id: profile.id,
            image_url: publicUrl,
            vendor: null,
            amount: null,
            receipt_date: null,
            category: null,
          });
        
        if (insertError) {
          console.error('[Receipts] Failed to save receipt:', insertError);
          throw new Error('Failed to save receipt');
        }
        
        showToast('Receipt uploaded! (Manual entry needed)', 'success');
      } else {
        showToast('Receipt uploaded and processed!', 'success');
      }
      
      loadReceipts();
      setShowScanner(false);
    } catch (err: any) {
      console.error('Failed to upload receipt:', err);
      showToast(err.message || 'Failed to upload receipt', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleAutoMatch = async () => {
    if (!profile?.company_id) return;
    setMatching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-match-receipts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ company_id: profile.company_id }),
        }
      );

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      showToast(`Matched ${result.matched} receipts to transactions!`, 'success');
      loadReceipts();
    } catch (err: any) {
      console.error('Auto-match failed:', err);
      showToast(err.message || 'Failed to match receipts', 'error');
    } finally {
      setMatching(false);
    }
  };

  const handleDeleteReceipt = async (id: string) => {
    if (!confirm('Delete this receipt?')) return;
    try {
      const { error } = await supabase.from('receipts').delete().eq('id', id);
      if (error) throw error;
      showToast('Receipt deleted', 'success');
      loadReceipts();
      setSelectedReceipt(null);
    } catch (err) {
      showToast('Failed to delete receipt', 'error');
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="p-2 sm:p-3 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-sm sm:text-base font-bold text-neutral-900">Receipts</h1>
          <p className="text-[10px] text-neutral-500">Scan and manage your expense receipts</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleAutoMatch}
            disabled={matching}
            className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] border border-[#476E66] text-[#476E66] rounded-lg hover:bg-[#476E66]/5 disabled:opacity-50 font-medium"
          >
            <Link2 className={`w-3 h-3 ${matching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{matching ? 'Matching...' : 'Auto-Match'}</span>
          </button>
          <button
            onClick={() => setShowScanner(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] text-[10px] font-medium"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Scan Receipt</span>
            <span className="sm:hidden">Scan</span>
          </button>
        </div>
      </div>

      {/* Receipts Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[3/4] bg-neutral-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : receipts.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-lg" style={{ boxShadow: 'var(--shadow-card)' }}>
          <ImageIcon className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
          <h3 className="text-sm font-medium text-neutral-900 mb-1">No receipts yet</h3>
          <p className="text-neutral-500 text-[10px] mb-3">Scan or upload your first receipt</p>
          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] text-[10px] font-medium"
          >
            <Camera className="w-3.5 h-3.5" />
            Scan Receipt
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {receipts.map((receipt) => (
            <div
              key={receipt.id}
              onClick={() => setSelectedReceipt(receipt)}
              className="bg-white rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="aspect-[3/4] bg-neutral-100 relative">
                <img
                  src={receipt.image_url}
                  alt="Receipt"
                  className="w-full h-full object-cover"
                />
                {receipt.matched_transaction_id && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-[#476E66] rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <div className="p-2">
                <p className="font-medium text-neutral-900 text-[10px] truncate">{receipt.vendor || 'Unknown Vendor'}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] font-semibold text-[#476E66]">{formatCurrency(receipt.amount)}</span>
                  <span className="text-[9px] text-neutral-500">{formatDate(receipt.receipt_date)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-4" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Scan Receipt</h3>
              <button onClick={() => setShowScanner(false)} className="p-1 hover:bg-neutral-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {uploading ? (
              <div className="text-center py-6">
                <RefreshCw className="w-6 h-6 text-[#476E66] animate-spin mx-auto mb-2" />
                <p className="text-neutral-600 text-xs">Processing receipt...</p>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-neutral-300 rounded-lg hover:border-[#476E66] hover:bg-[#476E66]/5 transition-colors"
                >
                  <Camera className="w-5 h-5 text-[#476E66]" />
                  <span className="font-medium text-neutral-700 text-xs">Take Photo</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-neutral-300 rounded-lg hover:border-[#476E66] hover:bg-[#476E66]/5 transition-colors"
                >
                  <Upload className="w-5 h-5 text-[#476E66]" />
                  <span className="font-medium text-neutral-700 text-xs">Upload from Gallery</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receipt Detail Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col" style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <div className="flex items-center justify-between p-3 border-b">
              <h3 className="text-sm font-semibold">Receipt Details</h3>
              <button onClick={() => setSelectedReceipt(null)} className="p-1 hover:bg-neutral-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              <div className="aspect-[3/4] bg-neutral-100 rounded-lg overflow-hidden mb-3">
                <img src={selectedReceipt.image_url} alt="Receipt" className="w-full h-full object-contain" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">Vendor</span>
                  <span className="font-medium">{selectedReceipt.vendor || '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">Amount</span>
                  <span className="font-semibold text-[#476E66]">{formatCurrency(selectedReceipt.amount)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">Date</span>
                  <span>{formatDate(selectedReceipt.receipt_date)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">Category</span>
                  <span className="capitalize">{selectedReceipt.category?.replace('_', ' ') || '—'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-500">Matched</span>
                  {selectedReceipt.matched_transaction_id ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#476E66]/10 text-[#476E66] border border-[#476E66]/20 rounded text-[9px] font-medium">
                      <Check className="w-2.5 h-2.5" /> Linked
                    </span>
                  ) : (
                    <span className="text-neutral-400 text-[10px]">Not matched</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border-t bg-neutral-50">
              <button
                onClick={() => handleDeleteReceipt(selectedReceipt.id)}
                className="flex items-center gap-1.5 px-2 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-[10px] font-medium"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
              <a
                href={selectedReceipt.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2 py-1.5 text-[#476E66] hover:bg-[#476E66]/10 rounded-lg text-[10px] font-medium"
              >
                <Eye className="w-3 h-3" />
                View Full Size
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
