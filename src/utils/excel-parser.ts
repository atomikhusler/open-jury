// src/utils/excel-parser.ts
import * as XLSX from 'xlsx';
import { Participant } from '../types/database.types';

export interface ParsedParticipantRow {
  event_name: string;
  serial_no: number;
  name: string;
  class_name?: string;
  school_name: string;
  cluster_name?: string;
  block_name?: string;
}

export interface ExcelParseResult {
  validRows: Omit<Participant, 'id' | 'event_id'>[];
  errors: string[];
  detectedEvents: string[];
}

// Normalizes header strings: "Sl. No. " -> "slno"
const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');

export function parseParticipantExcelBase64(base64Data: string): ExcelParseResult {
  const validRows: Omit<Participant, 'id' | 'event_id'>[] = [];
  const errors: string[] = [];
  const eventSet = new Set<string>();

  try {
    const cleanBase64 = base64Data.includes('base64,')
      ? base64Data.split('base64,')[1]
      : base64Data;

    const workbook = XLSX.read(cleanBase64, { type: 'base64' });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return { validRows: [], errors: ['Excel workbook contains no sheets.'], detectedEvents: [] };
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

    if (rawJson.length === 0) {
      return { validRows: [], errors: ['Selected sheet is empty.'], detectedEvents: [] };
    }

    rawJson.forEach((row, index) => {
      const rowNumber = index + 2; // Account for 1-based index + header row
      const normalizedRow: Record<string, string> = {};

      Object.keys(row).forEach((rawHeader) => {
        normalizedRow[normalizeKey(rawHeader)] = String(row[rawHeader] ?? '').trim();
      });

      const eventName =
        normalizedRow['eventname'] || normalizedRow['event'] || 'General';
      const rawSerial =
        normalizedRow['slno'] ||
        normalizedRow['serialno'] ||
        normalizedRow['serialnumber'] ||
        normalizedRow['srno'];
      const participantName =
        normalizedRow['nameoftheparticipant'] ||
        normalizedRow['participantname'] ||
        normalizedRow['name'] ||
        normalizedRow['studentname'];
      const schoolName =
        normalizedRow['schoolname'] || normalizedRow['school'] || normalizedRow['institution'];
      const className = normalizedRow['class'] || normalizedRow['grade'] || undefined;
      const clusterName = normalizedRow['clustername'] || normalizedRow['cluster'] || undefined;
      const blockName = normalizedRow['blockname'] || normalizedRow['block'] || undefined;

      const parsedSerial = parseInt(rawSerial, 10);

      if (!rawSerial || isNaN(parsedSerial) || parsedSerial <= 0) {
        errors.push(`Row ${rowNumber}: Invalid or missing 'Sl. No.' (${rawSerial || 'Empty'}).`);
        return;
      }
      if (!participantName) {
        errors.push(`Row ${rowNumber}: Missing 'Name of the Participant'.`);
        return;
      }
      if (!schoolName) {
        errors.push(`Row ${rowNumber}: Missing 'School Name' for ${participantName}.`);
        return;
      }

      if (eventName) eventSet.add(eventName);

      validRows.push({
        serial_no: parsedSerial,
        name: participantName,
        school_name: schoolName,
        class_name: className || undefined,
        cluster_name: clusterName || undefined,
        block_name: blockName || undefined,
      });
    });

    return {
      validRows: validRows.sort((a, b) => a.serial_no - b.serial_no),
      errors,
      detectedEvents: Array.from(eventSet),
    };
  } catch (err: any) {
    return {
      validRows: [],
      errors: [`Failed to parse Excel file: ${err?.message || 'Corrupted file format'}`],
      detectedEvents: [],
    };
  }
}