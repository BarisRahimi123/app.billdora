// PDF Export utilities for quotes and invoices

interface QuotePdfData {
  title: string;
  company: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    logo?: string;
  };
  client?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  lineItems: Array<{
    description: string;
    unitPrice: number;
    qty: number;
    unit: string;
  }>;
  totals: {
    subtotal: number;
    tax: number;
    total: number;
  };
  coverBgUrl?: string;
  volumeNumber?: string;
  validUntil?: string;
  terms?: string;
}

interface InvoicePdfData {
  invoiceNumber: string;
  company: {
    name: string;
    address?: string;
    phone?: string;
  };
  client?: {
    name?: string;
    email?: string;
  };
  lineItems?: Array<{
    description: string;
    amount: number;
  }>;
  totals: {
    subtotal?: number;
    tax?: number;
    total: number;
  };
  dueDate?: string;
  status?: string;
}

export async function generateQuotePdf(data: QuotePdfData): Promise<string> {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'quote', data }),
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data.html;
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw error;
  }
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<string> {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'invoice', data }),
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data.html;
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw error;
  }
}

export function downloadPdfFromHtml(html: string, filename: string) {
  // Create a new window with the HTML content
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to download PDF');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to load, then trigger print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
}

export function openPdfPreview(html: string) {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) {
    alert('Please allow popups to preview PDF');
    return;
  }

  previewWindow.document.write(html);
  previewWindow.document.close();
}
