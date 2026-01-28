import { useState, useCallback, useEffect } from 'react';
import { Building2, Link2, RefreshCw, CheckCircle2, Trash2 } from 'lucide-react';

const SUPABASE_URL = 'https://bqxnagmmegdbqrzhheip.supabase.co';

interface PlaidItem {
  id: string;
  institution_name: string;
  status: string;
  created_at: string;
  plaid_accounts: PlaidAccount[];
}

interface PlaidAccount {
  id: string;
  name: string;
  type: string;
  subtype: string;
  mask: string;
  current_balance: number;
}

interface PlaidLinkProps {
  userId: string;
  companyId: string;
  onSuccess?: () => void;
}

export default function PlaidLink({ userId, companyId, onSuccess }: PlaidLinkProps) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [connectedBanks, setConnectedBanks] = useState<PlaidItem[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);

  useEffect(() => {
    loadConnectedBanks();
    // Load Plaid Link SDK
    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  async function loadConnectedBanks() {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/plaid_items?company_id=eq.${companyId}&select=*,plaid_accounts(*)`,
        {
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxeG5hZ21tZWdkYnFyemhoZWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTM5NTgsImV4cCI6MjA2ODI2OTk1OH0.LBb7KaCSs7LpsD9NZCOcartkcDIIALBIrpnYcv5Y0yY',
            'Authorization': `Bearer ${localStorage.getItem('sb-bqxnagmmegdbqrzhheip-auth-token') ? JSON.parse(localStorage.getItem('sb-bqxnagmmegdbqrzhheip-auth-token')!).access_token : ''}`
          }
        }
      );
      const data = await response.json();
      setConnectedBanks(data || []);
    } catch (error) {
      console.error('Failed to load connected banks:', error);
    }
    setLoadingBanks(false);
  }

  const openPlaidLink = useCallback(async () => {
    setLoading(true);
    try {
      // Get link token
      const authToken = localStorage.getItem('sb-bqxnagmmegdbqrzhheip-auth-token');
      const accessToken = authToken ? JSON.parse(authToken).access_token : '';
      
      const tokenResponse = await fetch(`${SUPABASE_URL}/functions/v1/plaid-link-token`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ user_id: userId })
      });
      const { link_token, error } = await tokenResponse.json();

      if (error) {
        throw new Error(error);
      }

      // Open Plaid Link
      const handler = (window as any).Plaid.create({
        token: link_token,
        onSuccess: async (public_token: string, metadata: any) => {
          try {
            // Exchange token
            const authToken = localStorage.getItem('sb-bqxnagmmegdbqrzhheip-auth-token');
            const accessToken = authToken ? JSON.parse(authToken).access_token : '';
            await fetch(`${SUPABASE_URL}/functions/v1/plaid-exchange-token`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify({
                public_token,
                company_id: companyId,
                institution: metadata.institution
              })
            });
            
            await loadConnectedBanks();
            onSuccess?.();
          } catch (err) {
            console.error('Failed to exchange token:', err);
          }
        },
        onExit: () => {
          setLoading(false);
        }
      });

      handler.open();
    } catch (error) {
      console.error('Failed to open Plaid Link:', error);
      setLoading(false);
    }
  }, [userId, companyId, onSuccess]);

  async function syncTransactions(itemId: string) {
    setSyncing(itemId);
    try {
      const authToken = localStorage.getItem('sb-bqxnagmmegdbqrzhheip-auth-token');
      const accessToken = authToken ? JSON.parse(authToken).access_token : '';
      const response = await fetch(`${SUPABASE_URL}/functions/v1/plaid-sync-transactions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ plaid_item_id: itemId })
      });
      const result = await response.json();
      if (result.success) {
        onSuccess?.();
      }
    } catch (error) {
      console.error('Failed to sync transactions:', error);
    }
    setSyncing(null);
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  return (
    <div className="bg-white rounded-lg p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#476E66]" />
            Connected Banks
          </h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">
            Connect your bank for automatic transaction sync
          </p>
        </div>
        <button
          onClick={openPlaidLink}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#476E66] text-white rounded-lg hover:bg-[#3A5B54] transition-colors disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <Link2 className="w-3 h-3" />
          )}
          <span className="hidden sm:inline">Connect</span> Bank
        </button>
      </div>

      {loadingBanks ? (
        <div className="text-center py-4 text-xs text-neutral-500">Loading connected banks...</div>
      ) : connectedBanks.length === 0 ? (
        <div className="text-center py-4 border-2 border-dashed border-neutral-200 rounded-lg">
          <Building2 className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-xs text-neutral-500">No banks connected yet</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">
            Click "Connect Bank" to link your bank account
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {connectedBanks.map(bank => (
            <div key={bank.id} className="border border-neutral-100 rounded-lg p-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-[#476E66]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-3.5 h-3.5 text-[#476E66]" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-medium text-neutral-900 truncate">{bank.institution_name}</h4>
                    <p className="text-[10px] text-neutral-500">
                      {bank.plaid_accounts?.length || 0} account(s)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="flex items-center gap-0.5 text-[10px] text-green-600">
                    <CheckCircle2 className="w-3 h-3" />
                    <span className="hidden sm:inline">Connected</span>
                  </span>
                  <button
                    onClick={() => syncTransactions(bank.id)}
                    disabled={syncing === bank.id}
                    className="p-1 text-neutral-500 hover:text-[#476E66] hover:bg-neutral-100 rounded transition-colors"
                    title="Sync transactions"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncing === bank.id ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {bank.plaid_accounts && bank.plaid_accounts.length > 0 && (
                <div className="grid gap-1 mt-2 pt-2 border-t border-neutral-50">
                  {bank.plaid_accounts.map(account => (
                    <div key={account.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-neutral-700 truncate">{account.name}</span>
                        <span className="text-neutral-400 flex-shrink-0">••••{account.mask}</span>
                        <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] capitalize hidden sm:inline flex-shrink-0">
                          {account.subtype || account.type}
                        </span>
                      </div>
                      <span className="font-medium text-neutral-900 flex-shrink-0 ml-2">
                        {formatCurrency(account.current_balance)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
