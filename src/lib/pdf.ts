import { jsPDF } from 'jspdf';
import { formatISTDate, formatISTDateTime } from '../shared/scheduling.ts';
import type { Pickup } from '../shared/types.ts';

export function downloadPickupReceiptPdf(pickup: Pickup): void {
  const doc = new jsPDF();
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(21, 128, 61);
  doc.text('ScrapEase', 16, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Digital Scrap Collection & Recycling Receipt', 16, y + 6);
  doc.text(`Receipt No: ${pickup.code}`, 140, y);
  doc.text(`Status: ${pickup.status}`, 140, y + 6);

  y += 16;
  doc.setDrawColor(226, 232, 240);
  doc.line(16, y, 194, y);
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Household Details', 16, y);
  doc.text('Pickup & Collector Details', 110, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Name: ${pickup.household_name || 'Household Customer'}`, 16, y);
  doc.text(`Date: ${formatISTDate(pickup.pickup_date)}`, 110, y);
  y += 5;
  doc.text(`Address: ${pickup.address_snapshot.line1}`, 16, y);
  doc.text(`Slot: ${pickup.slot_label} IST`, 110, y);
  y += 5;
  doc.text(`${pickup.area}, ${pickup.address_snapshot.city} - ${pickup.pincode}`, 16, y);
  doc.text(`Collector: ${pickup.collector_name || 'Verified Partner'}`, 110, y);
  y += 5;
  doc.text(`Payment Method: ${pickup.payment_method || 'UPI'} (${pickup.payment_status})`, 110, y);

  y += 12;
  doc.setFillColor(241, 245, 249);
  doc.rect(16, y, 178, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Category', 19, y + 5.5);
  doc.text('Est. (kg)', 92, y + 5.5);
  doc.text('Actual (kg)', 120, y + 5.5);
  doc.text('Rate (INR/kg)', 148, y + 5.5);
  doc.text('Amount (INR)', 174, y + 5.5);

  y += 12;
  doc.setFont('helvetica', 'normal');
  for (const item of pickup.items) {
    doc.text(item.category_name, 19, y);
    doc.text(String(item.est_weight.toFixed(1)), 96, y);
    doc.text(item.actual_weight !== null ? item.actual_weight.toFixed(1) : '—', 124, y);
    doc.text(`Rs. ${item.rate_per_kg.toFixed(2)}`, 148, y);
    doc.text(`Rs. ${item.amount.toFixed(2)}`, 174, y);
    y += 7;
  }

  y += 4;
  doc.line(16, y, 194, y);
  y += 8;

  const totalW = pickup.actual_total_weight ?? pickup.est_total_weight;
  const totalAmt = pickup.actual_total_amount ?? pickup.est_total_amount;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Total Measured Weight: ${totalW.toFixed(1)} kg`, 16, y);
  doc.setTextColor(21, 128, 61);
  doc.text(`Total Payout: Rs. ${totalAmt.toFixed(2)}`, 135, y);

  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on ${formatISTDateTime(new Date().toISOString())}`, 16, y);
  doc.text('Thank you for recycling with ScrapEase Bengaluru.', 16, y + 5);

  doc.save(`ScrapEase-Receipt-${pickup.code}.pdf`);
}

export function downloadAdminPayoutsPdf(
  payouts: Array<{
    code: string;
    pickup_date: string;
    area: string;
    household_name: string;
    collector_name: string;
    actual_total_weight: number;
    actual_total_amount: number;
    commission_amount: number;
    payment_method: string;
  }>
): void {
  const doc = new jsPDF();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('ScrapEase — Completed Payouts & Commission Report', 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated: ${formatISTDateTime(new Date().toISOString())}`, 14, 24);

  let y = 34;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Code', 16, y + 5);
  doc.text('Date', 44, y + 5);
  doc.text('Area', 68, y + 5);
  doc.text('Collector', 100, y + 5);
  doc.text('Weight', 132, y + 5);
  doc.text('Payout', 152, y + 5);
  doc.text('Fee', 176, y + 5);

  y += 11;
  doc.setFont('helvetica', 'normal');
  for (const row of payouts.slice(0, 35)) {
    doc.text(row.code, 16, y);
    doc.text(row.pickup_date, 44, y);
    doc.text(row.area.slice(0, 16), 68, y);
    doc.text((row.collector_name || '—').slice(0, 16), 100, y);
    doc.text(`${Number(row.actual_total_weight || 0).toFixed(1)} kg`, 132, y);
    doc.text(`Rs.${Number(row.actual_total_amount || 0).toFixed(0)}`, 152, y);
    doc.text(`Rs.${Number(row.commission_amount || 0).toFixed(0)}`, 176, y);
    y += 6.5;
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
  }

  doc.save(`ScrapEase-Payout-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadCsv(rows: Array<Record<string, unknown>>, filename: string): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
