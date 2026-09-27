import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Receipt } from '../types/index.ts';

export function downloadCsv(meetingId: string): void {
  const token = localStorage.getItem('meetingmeter_token');
  const url = `/api/export/${meetingId}/csv`;

  fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((res) => {
      if (!res.ok) throw new Error('Failed to download CSV');
      return res.blob();
    })
    .then((blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `meetingmeter-${meetingId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    })
    .catch((err) => {
      console.error('CSV download error:', err);
      alert('Could not download CSV: ' + err.message);
    });
}

export async function exportReceiptToImage(elementId: string, filename: string = 'meeting-receipt.png'): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Receipt element not found for export');
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#FFFFFF',
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = imgData;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function exportReceiptToPdf(elementId: string, filename: string = 'meeting-receipt.pdf'): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Receipt element not found for export');
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#FFFFFF',
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
  pdf.save(filename);
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
