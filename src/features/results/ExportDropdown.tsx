import { Download, ChevronDown, FileSpreadsheet, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';
import type { ReconciliationResult } from '@/features/reconciliation/types';

interface ExportDropdownProps {
  result: ReconciliationResult;
}

function getDateString() {
  return new Date().toISOString().split('T')[0];
}

function downloadWorkbook(data: Record<string, unknown>[], sheetName: string, filename: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function ExportDropdown({ result }: ExportDropdownProps) {
  const date = getDateString();

  const handleExportAll = () => {
    const wb = XLSX.utils.book_new();
    const matchedData = result.matched.map((m) => {
      const rowA = m.transactionsA[0] ?? {};
      const rowB = m.transactionsB[0] ?? {};
      const prefixedA: Record<string, unknown> = {};
      const prefixedB: Record<string, unknown> = {};
      Object.entries(rowA).forEach(([k, v]) => { prefixedA[`A_${k}`] = v; });
      Object.entries(rowB).forEach(([k, v]) => { prefixedB[`B_${k}`] = v; });
      return { ...prefixedA, ...prefixedB, Confidence: Math.round(m.confidence * 100) + '%' };
    });
    if (matchedData.length > 0) {
      const ws1 = XLSX.utils.json_to_sheet(matchedData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Matched');
    }
    if (result.unmatchedA.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(result.unmatchedA);
      XLSX.utils.book_append_sheet(wb, ws2, 'Unmatched Source A');
    }
    if (result.unmatchedB.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(result.unmatchedB);
      XLSX.utils.book_append_sheet(wb, ws3, 'Unmatched Source B');
    }
    XLSX.writeFile(wb, `ReconcileX_Full_Results_${date}.xlsx`);
  };

  const handleExportMatched = () => {
    const data = result.matched.map((m) => {
      const rowA = m.transactionsA[0] ?? {};
      const rowB = m.transactionsB[0] ?? {};
      const prefixedA: Record<string, unknown> = {};
      const prefixedB: Record<string, unknown> = {};
      Object.entries(rowA).forEach(([k, v]) => { prefixedA[`A_${k}`] = v; });
      Object.entries(rowB).forEach(([k, v]) => { prefixedB[`B_${k}`] = v; });
      return { ...prefixedA, ...prefixedB, Confidence: Math.round(m.confidence * 100) + '%' };
    });
    downloadWorkbook(data, 'Matched', `ReconcileX_Matched_${date}.xlsx`);
  };

  const handleExportUnmatchedA = () => {
    downloadWorkbook(
      result.unmatchedA as unknown as Record<string, unknown>[],
      'Unmatched Source A',
      `ReconcileX_Unmatched_SourceA_${date}.xlsx`
    );
  };

  const handleExportUnmatchedB = () => {
    downloadWorkbook(
      result.unmatchedB as unknown as Record<string, unknown>[],
      'Unmatched Source B',
      `ReconcileX_Unmatched_SourceB_${date}.xlsx`
    );
  };

  const handleExportAllUnmatched = () => {
    const combined = [
      ...result.unmatchedA.map((r) => ({ ...r, Source: 'Source A' })),
      ...result.unmatchedB.map((r) => ({ ...r, Source: 'Source B' })),
    ];
    downloadWorkbook(
      combined as unknown as Record<string, unknown>[],
      'All Unmatched',
      `ReconcileX_All_Unmatched_${date}.xlsx`
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="rounded-lg cursor-pointer">
          <Download className="h-4 w-4 mr-2" />
          Export Results
          <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={handleExportAll}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export All (Workbook)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleExportMatched}>
          <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
          Export Matched Only
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleExportUnmatchedA}>
          <AlertCircle className="h-4 w-4 mr-2 text-amber-500" />
          Export Unmatched Source A
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleExportUnmatchedB}>
          <AlertCircle className="h-4 w-4 mr-2 text-amber-500" />
          Export Unmatched Source B
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleExportAllUnmatched}>
          <AlertTriangle className="h-4 w-4 mr-2 text-red-500" />
          Export All Unmatched
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
