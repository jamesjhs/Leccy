/**
 * Export utilities for generating downloadable files
 */

export async function downloadExcelExport(format: 'excel' | 'pdf'): Promise<void> {
  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Not authenticated');

    const endpoint = `/api/export/${format}`;
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error(`Export failed: ${res.statusText}`);
    }

    // Get filename from Content-Disposition header
    const contentDisposition = res.headers.get('content-disposition') || '';
    const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
    const filename = filenameMatch ? filenameMatch[1] : `leccy_export.${format === 'pdf' ? 'pdf' : 'xlsx'}`;

    // Create blob and download
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (err: any) {
    throw new Error(err.message || `Failed to download ${format} export`);
  }
}

export async function downloadExcel(): Promise<void> {
  return downloadExcelExport('excel');
}

export async function downloadPDF(): Promise<void> {
  return downloadExcelExport('pdf');
}
