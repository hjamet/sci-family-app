import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileText, Landmark, ShieldCheck, Download, Copy, Check, Calculator,
  Euro, PieChart, Info, ArrowUpRight, CheckCircle2, UserCheck, AlertCircle, FileCheck,
  ChevronDown, ChevronUp, Calendar, Users, Sparkles, BookOpen, X, Plus, Upload,
  Trash2, Paperclip, FileCode, Image as ImageIcon, File, Eye, AlertTriangle, RefreshCw,
  Pencil, Lock, User, Receipt, Wallet, FileSpreadsheet, ExternalLink
} from 'lucide-react';
import FinancialLedgerModal from '../components/FinancialLedgerModal';
import MemberTreasurySection from '../components/MemberTreasurySection';
import BankReauthBanner from '../components/BankReauthBanner';
import DriveReauthBanner from '../components/DriveReauthBanner';
import DocumentViewerModal from '../components/DocumentViewerModal';
import UploadDocumentModal from '../components/UploadDocumentModal';
import SelectExistingDocumentModal from '../components/SelectExistingDocumentModal';
import { BankMetricSkeleton } from '../components/SkeletonLoaders';
import CustomSelect from '../components/CustomSelect';
import TagMultiSelect, { getTagColorClass, parseDocumentTags } from '../components/TagMultiSelect';
import {
  fetchDocuments,
  fetchDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
  uploadDocument,
  createAccountingTransaction,
  updateDocument,
  deleteDocument,
  fetchBankStatus,
  fetchBankTransactions,
  triggerBankSync,
  fetchMemberExpenses,
  fetchCallsForFunds,
  validateMemberExpense,
  rejectMemberExpense,
  deleteMemberExpense
} from '../api';

// Palette de 8 couleurs sobres pour les catégories personnalisées (Annotation 5)
const COLOR_OPTIONS = [
  { id: 'slate', name: 'Ardoise', bg: 'bg-slate-500', text: 'text-slate-700', border: 'border-slate-500', badgeBg: 'bg-slate-100 text-slate-800 border-slate-200' },
  { id: 'emerald', name: 'Émeraude', bg: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-500', badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'amber', name: 'Ambre', bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-500', badgeBg: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'purple', name: 'Pourpre', bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-500', badgeBg: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'rose', name: 'Bordeaux', bg: 'bg-rose-700', text: 'text-rose-700', border: 'border-rose-700', badgeBg: 'bg-rose-100 text-rose-800 border-rose-200' },
  { id: 'sky', name: 'Bleu ciel', bg: 'bg-sky-500', text: 'text-sky-700', border: 'border-sky-500', badgeBg: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'teal', name: 'Vert sauge', bg: 'bg-teal-600', text: 'text-teal-700', border: 'border-teal-600', badgeBg: 'bg-teal-100 text-teal-800 border-teal-200' },
  { id: 'wood', name: 'Chêne', bg: 'bg-yellow-800', text: 'text-yellow-800', border: 'border-yellow-800', badgeBg: 'bg-amber-100 text-amber-900 border-amber-200' }
];

const EMOJI_PRESETS = ['🏛️', '💶', '🔧', '⚖️', '🛡️', '📜', '📬', '🏠', '📝', '💡', '🌳', '📁'];

function renderMarkdownLine(line, idx) {
  const trimmed = line.trim();
  if (trimmed.startsWith('# ')) {
    return <h1 key={idx} className="text-xl font-black text-slate-900 border-b pb-2 mb-3 mt-1">{trimmed.substring(2)}</h1>;
  }
  if (trimmed.startsWith('## ')) {
    return <h2 key={idx} className="text-base font-extrabold text-emerald-800 border-b pb-1 mb-2 mt-4">{trimmed.substring(3)}</h2>;
  }
  if (trimmed.startsWith('### ')) {
    return <h3 key={idx} className="text-sm font-bold text-slate-900 mt-3">{trimmed.substring(4)}</h3>;
  }
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
    return (
      <div key={idx} className="flex items-start space-x-2 text-xs text-slate-700 ml-2 my-1">
        <span className="text-emerald-500 font-bold">•</span>
        <span>{trimmed.substring(2)}</span>
      </div>
    );
  }
  if (trimmed === '---') {
    return <hr key={idx} className="my-3 border-slate-200" />;
  }
  if (trimmed === '') {
    return <div key={idx} className="h-1"></div>;
  }
  return <p key={idx} className="text-xs text-slate-700 leading-relaxed font-normal">{line}</p>;
}

// Initial Invoices Models — Vide par défaut pour n'afficher aucun faux document / facture inventée
const INITIAL_INVOICES = [];

// Composant QR Code SEPA EPC officiel Swan (Annotation 2)
const SWAN_SEPA_QR_PATH = "M2,2H3V3H2zM3,2H4V3H3zM4,2H5V3H4zM5,2H6V3H5zM6,2H7V3H6zM7,2H8V3H7zM8,2H9V3H8zM11,2H12V3H11zM12,2H13V3H12zM14,2H15V3H14zM18,2H19V3H18zM19,2H20V3H19zM23,2H24V3H23zM29,2H30V3H29zM30,2H31V3H30zM32,2H33V3H32zM34,2H35V3H34zM36,2H37V3H36zM37,2H38V3H37zM38,2H39V3H38zM39,2H40V3H39zM40,2H41V3H40zM41,2H42V3H41zM42,2H43V3H42zM2,3H3V4H2zM8,3H9V4H8zM12,3H13V4H12zM16,3H17V4H16zM17,3H18V4H17zM21,3H22V4H21zM22,3H23V4H22zM23,3H24V4H23zM25,3H26V4H25zM33,3H34V4H33zM36,3H37V4H36zM42,3H43V4H42zM2,4H3V5H2zM4,4H5V5H4zM5,4H6V5H5zM6,4H7V5H6zM8,4H9V5H8zM10,4H11V5H10zM14,4H15V5H14zM16,4H17V5H16zM17,4H18V5H17zM18,4H19V5H18zM20,4H21V5H20zM24,4H25V5H24zM27,4H28V5H27zM28,4H29V5H28zM29,4H30V5H29zM31,4H32V5H31zM32,4H33V5H32zM36,4H37V5H36zM38,4H39V5H38zM39,4H40V5H39zM40,4H41V5H40zM42,4H43V5H42zM2,5H3V6H2zM4,5H5V6H4zM5,5H6V6H5zM6,5H7V6H6zM8,5H9V6H8zM10,5H11V6H10zM11,5H12V6H11zM19,5H20V6H19zM20,5H21V6H20zM26,5H27V6H26zM29,5H30V6H29zM30,5H31V6H30zM32,5H33V6H32zM33,5H34V6H33zM36,5H37V6H36zM38,5H39V6H38zM39,5H40V6H39zM40,5H41V6H40zM42,5H43V6H42zM2,6H3V7H2zM4,6H5V7H4zM5,6H6V7H5zM6,6H7V7H6zM8,6H9V7H8zM10,6H11V7H10zM12,6H13V7H12zM16,6H17V7H16zM18,6H19V7H18zM20,6H21V7H20zM22,6H23V7H22zM23,6H24V7H23zM24,6H25V7H24zM25,6H26V7H25zM27,6H28V7H27zM28,6H29V7H28zM29,6H30V7H29zM30,6H31V7H30zM32,6H33V7H32zM34,6H35V7H34zM36,6H37V7H36zM38,6H39V7H38zM39,6H40V7H39zM40,6H41V7H40zM42,6H43V7H42zM2,7H3V8H2zM8,7H9V8H8zM10,7H11V8H10zM12,7H13V8H12zM14,7H15V8H14zM15,7H16V8H15zM16,7H17V8H16zM18,7H19V8H18zM19,7H20V8H19zM20,7H21V8H20zM24,7H25V8H24zM26,7H27V8H26zM27,7H28V8H27zM29,7H30V8H29zM32,7H33V8H32zM34,7H35V8H34zM36,7H37V8H36zM42,7H43V8H42zM2,8H3V9H2zM3,8H4V9H3zM4,8H5V9H4zM5,8H6V9H5zM6,8H7V9H6zM7,8H8V9H7zM8,8H9V9H8zM10,8H11V9H10zM12,8H13V9H12zM14,8H15V9H14zM16,8H17V9H16zM18,8H19V9H18zM20,8H21V9H20zM22,8H23V9H22zM24,8H25V9H24zM26,8H27V9H26zM28,8H29V9H28zM30,8H31V9H30zM32,8H33V9H32zM34,8H35V9H34zM36,8H37V9H36zM37,8H38V9H37zM38,8H39V9H38zM39,8H40V9H39zM40,8H41V9H40zM41,8H42V9H41zM42,8H43V9H42zM10,9H11V10H10zM11,9H12V10H11zM13,9H14V10H13zM16,9H17V10H16zM17,9H18V10H17zM18,9H19V10H18zM21,9H22V10H21zM22,9H23V10H22zM23,9H24V10H23zM26,9H27V10H26zM2,10H3V11H2zM4,10H5V11H4zM5,10H6V11H5zM6,10H7V11H6zM7,10H8V11H7zM8,10H9V11H8zM11,10H12V11H11zM12,10H13V11H12zM13,10H14V11H13zM15,10H16V11H15zM16,10H17V11H16zM17,10H18V11H17zM18,10H19V11H18zM22,10H23V11H22zM23,10H24V11H23zM24,10H25V11H24zM26,10H27V11H26zM28,10H29V11H28zM29,10H30V11H29zM32,10H33V11H32zM33,10H34V11H33zM34,10H35V11H34zM36,10H37V11H36zM37,10H38V11H37zM38,10H39V11H38zM39,10H40V11H39zM40,10H41V11H40zM2,11H3V12H2zM3,11H4V12H3zM4,11H5V12H4zM5,11H6V12H5zM7,11H8V12H7zM9,11H10V12H9zM10,11H11V12H10zM12,11H13V12H12zM13,11H14V12H13zM14,11H15V12H14zM20,11H21V12H20zM22,11H23V12H22zM23,11H24V12H23zM24,11H25V12H24zM28,11H29V12H28zM29,11H30V12H29zM31,11H32V12H31zM32,11H33V12H32zM33,11H34V12H33zM35,11H36V12H35zM36,11H37V12H36zM38,11H39V12H38zM42,11H43V12H42zM5,12H6V13H5zM6,12H7V13H6zM8,12H9V13H8zM12,12H13V13H12zM15,12H16V13H15zM16,12H17V13H16zM19,12H20V13H19zM20,12H21V13H20zM24,12H25V13H24zM26,12H27V13H26zM27,12H28V13H27zM29,12H30V13H29zM36,12H37V13H36zM38,12H39V13H38zM40,12H41V13H40zM41,12H42V13H41zM42,12H43V13H42zM3,13H4V14H3zM4,13H5V14H4zM5,13H6V14H5zM6,13H7V14H6zM9,13H10V14H9zM10,13H11V14H10zM14,13H15V14H14zM15,13H16V14H15zM16,13H17V14H16zM19,13H20V14H19zM20,13H21V14H20zM21,13H22V14H21zM25,13H26V14H25zM26,13H27V14H26zM28,13H29V14H28zM29,13H30V14H29zM30,13H31V14H30zM32,13H33V14H32zM33,13H34V14H33zM35,13H36V14H35zM37,13H38V14H37zM39,13H40V14H39zM2,14H3V15H2zM3,14H4V15H3zM5,14H6V15H5zM6,14H7V15H6zM7,14H8V15H7zM8,14H9V15H8zM9,14H10V15H9zM11,14H12V15H11zM12,14H13V15H12zM13,14H14V15H13zM14,14H15V15H14zM16,14H17V15H16zM18,14H19V15H18zM21,14H22V15H21zM24,14H25V15H24zM29,14H30V15H29zM30,14H31V15H30zM33,14H34V15H33zM35,14H36V15H35zM36,14H37V15H36zM38,14H39V15H38zM41,14H42V15H41zM42,14H43V15H42zM3,15H4V16H3zM5,15H6V16H5zM12,15H13V16H12zM13,15H14V16H13zM17,15H18V16H17zM18,15H19V16H18zM20,15H21V16H20zM22,15H23V16H22zM23,15H24V16H23zM24,15H25V16H24zM25,15H26V16H25zM26,15H27V16H26zM32,15H33V16H32zM33,15H34V16H33zM35,15H36V16H35zM37,15H38V16H37zM38,15H39V16H38zM40,15H41V16H40zM7,16H8V17H7zM8,16H9V17H8zM12,16H13V17H12zM15,16H16V17H15zM16,16H17V17H16zM17,16H18V17H17zM18,16H19V17H18zM20,16H21V17H20zM21,16H22V17H21zM22,16H23V17H22zM23,16H24V17H23zM25,16H26V17H25zM30,16H31V17H30zM34,16H35V17H34zM35,16H36V17H35zM38,16H39V17H38zM42,16H43V17H42zM2,17H3V18H2zM9,17H10V18H9zM10,17H11V18H10zM11,17H12V18H11zM12,17H13V18H12zM14,17H15V18H14zM16,17H17V18H16zM17,17H18V18H17zM19,17H20V18H19zM24,17H25V18H24zM29,17H30V18H29zM31,17H32V18H31zM32,17H33V18H32zM34,17H35V18H34zM35,17H36V18H35zM37,17H38V18H37zM39,17H40V18H39zM41,17H42V18H41zM42,17H43V18H42zM3,18H4V19H3zM5,18H6V19H5zM6,18H7V19H6zM7,18H8V19H7zM8,18H9V19H8zM10,18H11V19H10zM12,18H13V19H12zM14,18H15V19H14zM15,18H16V19H15zM16,18H17V19H16zM17,18H18V19H17zM18,18H19V19H18zM20,18H21V19H20zM21,18H22V19H21zM23,18H24V19H23zM24,18H25V19H24zM26,18H27V19H26zM27,18H28V19H27zM29,18H30V19H29zM33,18H34V19H33zM35,18H36V19H35zM37,18H38V19H37zM41,18H42V19H41zM3,19H4V20H3zM4,19H5V20H4zM6,19H7V20H6zM11,19H12V20H11zM16,19H17V20H16zM17,19H18V20H17zM19,19H20V20H19zM23,19H24V20H23zM26,19H27V20H26zM29,19H30V20H29zM30,19H31V20H30zM32,19H33V20H32zM34,19H35V20H34zM36,19H37V20H36zM38,19H39V20H38zM41,19H42V20H41zM5,20H6V21H5zM6,20H7V21H6zM8,20H9V21H8zM9,20H10V21H9zM10,20H11V21H10zM11,20H12V21H11zM12,20H13V21H12zM13,20H14V21H13zM14,20H15V21H14zM16,20H17V21H16zM17,20H18V21H17zM18,20H19V21H18zM20,20H21V21H20zM21,20H22V21H21zM23,20H24V21H23zM28,20H29V21H28zM32,20H33V21H32zM34,20H35V21H34zM3,21H4V22H3zM4,21H5V22H4zM5,21H6V22H5zM9,21H10V22H9zM11,21H12V22H11zM12,21H13V22H12zM14,21H15V22H14zM15,21H16V22H15zM16,21H17V22H16zM18,21H19V22H18zM20,21H21V22H20zM24,21H25V22H24zM26,21H27V22H26zM27,21H28V22H27zM28,21H29V22H28zM29,21H30V22H29zM34,21H35V22H34zM39,21H40V22H39zM40,21H41V22H40zM41,21H42V22H41zM2,22H3V23H2zM4,22H5V23H4zM5,22H6V23H5zM7,22H8V23H7zM8,22H9V23H8zM9,22H10V23H9zM15,22H16V23H15zM16,22H17V23H16zM20,22H21V23H20zM25,22H26V23H25zM27,22H28V23H27zM30,22H31V23H30zM31,22H32V23H31zM32,22H33V23H32zM38,22H39V23H38zM40,22H41V23H40zM41,22H42V23H41zM2,23H3V24H2zM4,23H5V24H4zM9,23H10V24H9zM10,23H11V24H10zM11,23H12V24H11zM12,23H13V24H12zM16,23H17V24H16zM17,23H18V24H17zM20,23H21V24H20zM22,23H23V24H22zM23,23H24V24H23zM26,23H27V24H26zM28,23H29V24H28zM29,23H30V24H29zM30,23H31V24H30zM31,23H32V24H31zM32,23H33V24H32zM34,23H35V24H34zM35,23H36V24H35zM37,23H38V24H37zM39,23H40V24H39zM40,23H41V24H40zM41,23H42V24H41zM2,24H3V25H2zM7,24H8V25H7zM8,24H9V25H8zM15,24H16V25H15zM17,24H18V25H17zM18,24H19V25H18zM19,24H20V25H19zM20,24H21V25H20zM22,24H23V25H22zM26,24H27V25H26zM27,24H28V25H27zM29,24H30V25H29zM30,24H31V25H30zM31,24H32V25H31zM32,24H33V25H32zM35,24H36V25H35zM36,24H37V25H36zM37,24H38V25H37zM38,24H39V25H38zM39,24H40V25H39zM2,25H3V26H2zM3,25H4V26H3zM7,25H8V26H7zM10,25H11V26H10zM12,25H13V26H12zM14,25H15V26H14zM17,25H18V26H17zM21,25H22V26H21zM22,25H23V26H22zM23,25H24V26H23zM25,25H26V26H25zM26,25H27V26H26zM28,25H29V26H28zM29,25H30V26H29zM30,25H31V26H30zM32,25H33V26H32zM33,25H34V26H33zM34,25H35V26H34zM38,25H39V26H38zM40,25H41V26H40zM41,25H42V26H41zM7,26H8V27H7zM8,26H9V27H8zM12,26H13V27H12zM13,26H14V27H13zM16,26H17V27H16zM17,26H18V27H17zM26,26H27V27H26zM28,26H29V27H28zM29,26H30V27H29zM30,26H31V27H30zM35,26H36V27H35zM37,26H38V27H37zM39,26H40V27H39zM40,26H41V27H40zM42,26H43V27H42zM2,27H3V28H2zM3,27H4V28H3zM4,27H5V28H4zM10,27H11V28H10zM14,27H15V28H14zM15,27H16V28H15zM16,27H17V28H16zM17,27H18V28H17zM19,27H20V28H19zM20,27H21V28H20zM24,27H25V28H24zM27,27H28V28H27zM28,27H29V28H28zM29,27H30V28H29zM30,27H31V28H30zM31,27H32V28H31zM5,28H6V29H5zM7,28H8V29H7zM8,28H9V29H8zM9,28H10V29H9zM10,28H11V29H10zM11,28H12V29H11zM12,28H13V29H12zM13,28H14V29H13zM19,28H20V29H19zM20,28H21V29H20zM23,28H24V29H23zM26,28H27V29H26zM27,28H28V29H27zM29,28H30V29H29zM30,28H31V29H30zM35,28H36V29H35zM38,28H39V29H38zM39,28H40V29H39zM40,28H41V29H40zM41,28H42V29H41zM42,28H43V29H42zM2,29H3V30H2zM4,29H5V30H4zM9,29H10V30H9zM11,29H12V30H11zM15,29H16V30H15zM17,29H18V30H17zM18,29H19V30H18zM19,29H20V30H19zM21,29H22V30H21zM24,29H25V30H24zM25,29H26V30H25zM32,29H33V30H32zM33,29H34V30H33zM38,29H39V30H38zM39,29H40V30H39zM2,30H3V31H2zM3,30H4V31H3zM4,30H5V31H4zM5,30H6V31H5zM6,30H7V31H6zM7,30H8V31H7zM8,30H9V31H8zM9,30H10V31H9zM10,30H11V31H10zM11,30H12V31H11zM12,30H13V31H12zM13,30H14V31H13zM14,30H15V31H14zM15,30H16V31H15zM16,30H17V31H16zM18,30H19V31H18zM19,30H20V31H19zM25,30H26V31H25zM26,30H27V31H26zM28,30H29V31H28zM29,30H30V31H29zM30,30H31V31H30zM38,30H39V31H38zM41,30H42V31H41zM2,31H3V32H2zM4,31H5V32H4zM7,31H8V32H7zM9,31H10V32H9zM11,31H12V32H11zM14,31H15V32H14zM15,31H16V32H15zM16,31H17V32H16zM17,31H18V32H17zM20,31H21V32H20zM22,31H23V32H22zM23,31H24V32H23zM24,31H25V32H24zM25,31H26V32H25zM26,31H27V32H26zM27,31H28V32H27zM31,31H32V32H31zM32,31H33V32H32zM35,31H36V32H35zM37,31H38V32H37zM38,31H39V32H38zM39,31H40V32H39zM41,31H42V32H41zM42,31H43V32H42zM2,32H3V33H2zM5,32H6V33H5zM7,32H8V33H7zM8,32H9V33H8zM9,32H10V33H9zM11,32H12V33H11zM12,32H13V33H12zM13,32H14V33H13zM17,32H18V33H17zM18,32H19V33H18zM21,32H22V33H21zM22,32H23V33H22zM23,32H24V33H23zM25,32H26V33H25zM30,32H31V33H30zM32,32H33V33H32zM34,32H35V33H34zM35,32H36V33H35zM38,32H39V33H38zM39,32H40V33H39zM2,33H3V34H2zM5,33H6V34H5zM6,33H7V34H6zM7,33H8V34H7zM10,33H11V34H10zM11,33H12V34H11zM13,33H14V34H13zM15,33H16V34H15zM16,33H17V34H16zM17,33H18V34H17zM18,33H19V34H18zM19,33H20V34H19zM20,33H21V34H20zM22,33H23V34H22zM24,33H25V34H24zM26,33H27V34H26zM29,33H30V34H29zM30,33H31V34H30zM31,33H32V34H31zM32,33H33V34H32zM34,33H35V34H34zM35,33H36V34H35zM37,33H38V34H37zM39,33H40V34H39zM41,33H42V34H41zM42,33H43V34H42zM2,34H3V35H2zM4,34H5V35H4zM5,34H6V35H5zM8,34H9V35H8zM10,34H11V35H10zM11,34H12V35H11zM15,34H16V35H15zM16,34H17V35H16zM17,34H18V35H17zM20,34H21V35H20zM22,34H23V35H22zM23,34H24V35H23zM25,34H26V35H25zM26,34H27V35H26zM27,34H28V35H27zM29,34H30V35H29zM30,34H31V35H30zM33,34H34V35H33zM34,34H35V35H34zM35,34H36V35H35zM36,34H37V35H36zM37,34H38V35H37zM38,34H39V35H38zM10,35H11V36H10zM12,35H13V36H12zM14,35H15V36H14zM15,35H16V36H15zM16,35H17V36H16zM19,35H20V36H19zM20,35H21V36H20zM21,35H22V36H21zM23,35H24V36H23zM24,35H25V36H24zM25,35H26V36H25zM26,35H27V36H26zM27,35H28V36H27zM32,35H33V36H32zM33,35H34V36H33zM34,35H35V36H34zM38,35H39V36H38zM39,35H40V36H39zM40,35H41V36H40zM41,35H42V36H41zM42,35H43V36H42zM2,36H3V37H2zM3,36H4V37H3zM4,36H5V37H4zM5,36H6V37H5zM6,36H7V37H6zM7,36H8V37H7zM8,36H9V37H8zM11,36H12V37H11zM14,36H15V37H14zM16,36H17V37H16zM17,36H18V37H17zM19,36H20V37H19zM21,36H22V37H21zM22,36H23V37H22zM23,36H24V37H23zM24,36H25V37H24zM26,36H27V37H26zM32,36H33V37H32zM34,36H35V37H34zM36,36H37V37H36zM38,36H39V37H38zM41,36H42V37H41zM2,37H3V38H2zM8,37H9V38H8zM10,37H11V38H10zM11,37H12V38H11zM12,37H13V38H12zM13,37H14V38H13zM17,37H18V38H17zM19,37H20V38H19zM20,37H21V38H20zM22,37H23V38H22zM24,37H25V38H24zM26,37H27V38H26zM27,37H28V38H27zM28,37H29V38H28zM29,37H30V38H29zM31,37H32V38H31zM33,37H34V38H33zM34,37H35V38H34zM38,37H39V38H38zM39,37H40V38H39zM2,38H3V39H2zM4,38H5V39H4zM5,38H6V39H5zM6,38H7V39H6zM8,38H9V39H8zM10,38H11V39H10zM11,38H12V39H11zM13,38H14V39H13zM14,38H15V39H14zM15,38H16V39H15zM16,38H17V39H16zM18,38H19V39H18zM22,38H23V39H22zM23,38H24V39H23zM25,38H26V39H25zM28,38H29V39H28zM29,38H30V39H29zM32,38H33V39H32zM34,38H35V39H34zM35,38H36V39H35zM36,38H37V39H36zM37,38H38V39H37zM38,38H39V39H38zM39,38H40V39H39zM41,38H42V39H41zM42,38H43V39H42zM2,39H3V40H2zM4,39H5V40H4zM5,39H6V40H5zM6,39H7V40H6zM8,39H9V40H8zM10,39H11V40H10zM12,39H13V40H12zM15,39H16V40H15zM17,39H18V40H17zM19,39H20V40H19zM20,39H21V40H20zM21,39H22V40H21zM23,39H24V40H23zM24,39H25V40H24zM28,39H29V40H28zM29,39H30V40H29zM30,39H31V40H30zM33,39H34V40H33zM35,39H36V40H35zM38,39H39V40H38zM40,39H41V40H40zM41,39H42V40H41zM42,39H43V40H42zM2,40H3V41H2zM4,40H5V41H4zM5,40H6V41H5zM6,40H7V41H6zM8,40H9V41H8zM10,40H11V41H10zM12,40H13V41H12zM13,40H14V41H13zM15,40H16V41H15zM20,40H21V41H20zM22,40H23V41H22zM26,40H27V41H26zM27,40H28V41H27zM28,40H29V41H28zM29,40H30V41H29zM30,40H31V41H30zM31,40H32V41H31zM32,40H33V41H32zM33,40H34V41H33zM36,40H37V41H36zM38,40H39V41H38zM39,40H40V41H39zM41,40H42V41H41zM2,41H3V42H2zM8,41H9V42H8zM11,41H12V42H11zM12,41H13V42H12zM13,41H14V42H13zM15,41H16V42H15zM17,41H18V42H17zM18,41H19V42H18zM19,41H20V42H19zM21,41H22V42H21zM22,41H23V42H22zM23,41H24V42H23zM25,41H26V42H25zM28,41H29V42H28zM29,41H30V42H29zM33,41H34V42H33zM36,41H37V42H36zM38,41H39V42H38zM40,41H41V42H40zM41,41H42V42H41zM2,42H3V43H2zM3,42H4V43H3zM4,42H5V43H4zM5,42H6V43H5zM6,42H7V43H6zM7,42H8V43H7zM8,42H9V43H8zM10,42H11V43H10zM11,42H12V43H11zM12,42H13V43H12zM14,42H15V43H14zM17,42H18V43H17zM22,42H23V43H22zM26,42H27V43H26zM28,42H29V43H28zM33,42H34V43H33zM35,42H36V43H35zM36,42H37V43H36zM37,42H38V43H37zM38,42H39V43H38zM39,42H40V43H39z";

export function SwanSepaQrCodeSvg({ size = 56, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 45 45"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="QR Code SEPA EPC Swan"
    >
      <rect width="45" height="45" fill="white" rx="3" />
      <path d={SWAN_SEPA_QR_PATH} fill="#064e3b" fillRule="nonzero" />
    </svg>
  );
}

export default function AdminInfoPage({ currentUser }) {
  const activeUser = currentUser || localStorage.getItem('sci_user') || 'Henri Jamet';
  const currentUserName = (
    currentUser && typeof currentUser === 'object'
      ? (currentUser.name || currentUser.fullName || (currentUser.prenom ? `${currentUser.prenom} ${currentUser.nom || ''}`.trim() : null) || currentUser.id)
      : (typeof currentUser === 'string' && currentUser ? currentUser : null)
  ) || (typeof activeUser === 'string' ? activeUser : 'Henri Jamet');
  const isCoordinator = Boolean(currentUser?.is_coordinator);

  // Compteur de synchronisation de la section Trésorerie des associés
  const [treasuryRefreshTrigger, setTreasuryRefreshTrigger] = useState(0);

  // KPI Financial Totals (Zéro valeur inventée - initialisé à null)
  const [financialTotals, setFinancialTotals] = useState({
    entrees: null,
    sorties: null,
    reserves: null
  });

  // Open Banking Status
  const [bankStatus, setBankStatus] = useState(null);
  const [isLoadingBank, setIsLoadingBank] = useState(true);

  const loadBankStatus = async (options = {}) => {
    setIsLoadingBank(true);
    try {
      const [data, txData] = await Promise.all([
        fetchBankStatus(options),
        fetchBankTransactions({ limit: 200 }).catch(() => [])
      ]);
      setBankStatus(data);
      if (data && data.total_balance !== undefined && data.total_balance !== null && data.status === 'ok' && !data.needs_reauth) {
        const txList = Array.isArray(data.recent_transactions)
          ? data.recent_transactions
          : (Array.isArray(txData) ? txData : []);
        const computedEntrees = txList
          .filter((t) => Number(t.amount) > 0)
          .reduce((acc, t) => acc + Number(t.amount), 0);
        const computedSorties = txList
          .filter((t) => Number(t.amount) < 0)
          .reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);

        setFinancialTotals({
          reserves: data.total_balance,
          entrees: data.entrees !== undefined && data.entrees !== null
            ? Number(data.entrees)
            : (data.total_inflows !== undefined && data.total_inflows !== null ? Number(data.total_inflows) : computedEntrees),
          sorties: data.sorties !== undefined && data.sorties !== null
            ? Number(data.sorties)
            : (data.total_outflows !== undefined && data.total_outflows !== null ? Number(data.total_outflows) : computedSorties)
        });
      }
    } catch (err) {
      console.warn('Bank status load notice:', err.message);
      setBankStatus((prev) => prev || {
        status: 'error',
        needs_reauth: true,
        message: 'Liaison bancaire indisponible : impossible d\'interroger le service bancaire.',
        raw_error: err.message || 'Impossible d\'interroger le service bancaire.',
        error_code: err.status || 'NET_ERROR',
        error_details: err.stack || err.message,
        last_sync_attempt: new Date().toISOString(),
      });
    } finally {
      setIsLoadingBank(false);
    }
  };

  // Détermine si des données bancaires réelles et actives sont disponibles (fallback défensif false)
  const hasRealBankData = Boolean(
    bankStatus &&
    bankStatus.status === 'ok' &&
    !bankStatus.needs_reauth &&
    bankStatus.total_balance !== undefined &&
    bankStatus.total_balance !== null
  );

  // Documents State (Zéro document fictif — branché sur /api/documents)
  const [documents, setDocuments] = useState([]);
  const [isDocsLoading, setIsDocsLoading] = useState(true);
  const [categoriesList, setCategoriesList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortCriteria, setSortCriteria] = useState('recent');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // Invoices State
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const isHenriUser = (currentUserName || '').toLowerCase().includes('henri');
  const myInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const p = (inv.memberPrenom || '').toLowerCase();
      if (isHenriUser) {
        return p === 'henri' || inv.memberId === 1 || (!p && !inv.memberId);
      }
      return p === (currentUser?.prenom || '').toLowerCase() || inv.memberId === currentUser?.id;
    });
  }, [invoices, currentUserName, currentUser, isHenriUser]);

  // ANNOTATION 2 : Filtrer STRICTEMENT les factures et notes de frais déposées manuellement par les membres
  // Retirer impérativement les appels de fonds et les paiements bancaires
  const manualMemberExpenses = useMemo(() => {
    return invoices.filter((inv) => {
      if (inv.isCallForFunds) return false;
      if (inv.id && String(inv.id).startsWith('cff-')) return false;
      if (inv.supplier && inv.supplier.includes('Appel de fonds')) return false;
      if (inv.reference && String(inv.reference).startsWith('AF-')) return false;
      if (inv.taxInfo && inv.taxInfo.includes('QR code SEPA')) return false;
      return Boolean(inv.rawExpense || (!inv.isCallForFunds && inv.payerType));
    });
  }, [invoices]);

  // Modals Visibility
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadModalMode, setUploadModalMode] = useState('document'); // 'document' | 'invoice'
  const [isOperationModalOpen, setIsOperationModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [selectedRenamingDoc, setSelectedRenamingDoc] = useState(null);
  const [renameInputValue, setRenameInputValue] = useState('');
  const [renameDocTags, setRenameDocTags] = useState([]);

  // Upload Modal State (Annotation 5 : Organisme, Titre, Format Canonique, Catégories Custom)
  const [uploadOrganisme, setUploadOrganisme] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileDropInputRef = useRef(null);

  // Création catégorie personnalisée inline
  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('📁');
  const [newCatColor, setNewCatColor] = useState('slate');
  const [isCreatingCat, setIsCreatingCat] = useState(false);

  // Édition / suppression catégorie (Annotation 10)
  const [isEditCategoryModalOpen, setIsEditCategoryModalOpen] = useState(false);
  const [selectedEditingCat, setSelectedEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatEmoji, setEditCatEmoji] = useState('📁');
  const [editCatColor, setEditCatColor] = useState('slate');
  const [isUpdatingCat, setIsUpdatingCat] = useState(false);
  const [isDeletingCat, setIsDeletingCat] = useState(false);

  const [operationType, setOperationType] = useState('out'); // Exclusivement Sorties déductibles (Annotation 5)
  const [operationAmount, setOperationAmount] = useState('');
  const [operationDate, setOperationDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [operationLabel, setOperationLabel] = useState('');
  const [operationFile, setOperationFile] = useState(null);
  const [operationDocument, setOperationDocument] = useState(null);
  const [operationFileName, setOperationFileName] = useState('');
  const [operationFileError, setOperationFileError] = useState('');
  const [operationLabelError, setOperationLabelError] = useState('');
  const [isSubmittingOperation, setIsSubmittingOperation] = useState(false);
  const [isOpUploadModalOpen, setIsOpUploadModalOpen] = useState(false);
  const [isOpSelectExistingModalOpen, setIsOpSelectExistingModalOpen] = useState(false);

  // État persistant d'erreur bancaire (Consigne Henri : aucune disparition automatique pour les erreurs)
  const [bankingError, setBankingError] = useState(null);

  // Toast State
  const [toast, setToast] = useState({
    visible: false,
    title: '',
    desc: '',
    icon: 'check_circle'
  });
  const toastTimerRef = useRef(null);

  const showToast = (title, desc, icon = 'check_circle') => {
    // ANNOTATION 13 : Suppression du toast d'erreur rouge doublon.
    // Toute erreur est exclusivement routée vers le bus d'événement global app-error (GlobalErrorAlert).
    if (icon === 'error' || icon === 'alert' || (title && title.toLowerCase().includes('erreur'))) {
      window.dispatchEvent(new CustomEvent('app-error', {
        detail: {
          message: desc ? `${title} : ${desc}` : title,
          status: 500,
          endpoint: '/api/documents/upload'
        }
      }));
      return;
    }

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, title, desc, icon });

    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 4000);
  };

  // Chargement réel des documents depuis /api/documents (Annotation 6)
  const loadDocuments = async () => {
    setIsDocsLoading(true);
    try {
      const data = await fetchDocuments();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Erreur chargement documents réels:', err.message);
      setDocuments([]);
    } finally {
      setIsDocsLoading(false);
    }
  };

  // Chargement des catégories depuis /api/documents/categories (Annotation 5)
  const loadCategories = async () => {
    try {
      const cats = await fetchDocumentCategories();
      if (Array.isArray(cats) && cats.length > 0) {
        setCategoriesList(cats);
        if (!uploadCategory) {
          setUploadCategory(cats[0].name);
        }
      }
    } catch (err) {
      console.warn('Erreur chargement catégories:', err.message);
    }
  };

  const loadInvoices = async () => {
    try {
      const [expensesList, callsList] = await Promise.all([
        fetchMemberExpenses().catch(() => []),
        fetchCallsForFunds().catch(() => [])
      ]);

      const formattedCalls = Array.isArray(callsList) ? callsList.map((call) => {
        const isPaid = call.status === 'REGLE' || call.status === 'COUVERT';
        const pdfFilename = call.pdf_filename || `SCI ${String(call.month).padStart(2, '0')}${call.year} Avis Appel de Fonds ${call.member_name ? call.member_name.split(' ')[0] : 'Membre'}.pdf`;
        const pdfUrl = `/api/calls-for-funds/${call.id}/pdf`;

        return {
          id: `cff-${call.id}`,
          callId: call.id,
          date: `01/${String(call.month).padStart(2, '0')}/${call.year}`,
          dueDate: `Échéance ${call.period_label || 'Appel de fonds'}`,
          dueWarning: !isPaid && Number(call.net_amount !== undefined ? call.net_amount : (call.amount_due || 0)) > 0,
          supplier: 'SCI Hellenvilliers (Appel de fonds)',
          reference: call.reference || `AF-${call.year}${String(call.month).padStart(2, '0')}`,
          amount: `${Number(call.net_amount !== undefined ? call.net_amount : (call.amount_due || 0)).toFixed(2).replace('.', ',')} €`,
          taxInfo: 'Avis officiel • QR code SEPA EPC',
          statusType: isPaid ? 'paid' : (call.status === 'EMIS' ? 'pending' : 'verified'),
          status: call.status === 'REGLE' ? 'Réglé' : (call.status === 'COUVERT' ? 'Couvert par avance' : 'Appel de fonds émis'),
          filename: pdfFilename,
          document_url: pdfUrl,
          file_url: pdfUrl,
          payerType: 'sci',
          memberId: call.member_id,
          memberPrenom: call.member_name ? call.member_name.split(' ')[0] : '',
          memberName: call.member_name || 'Associé',
          isCallForFunds: true,
          rawCall: call
        };
      }) : [];

      const formattedExpenses = Array.isArray(expensesList) ? expensesList.map((exp) => {
        const isSciToPay = exp.payer_type === 'sci' || exp.status === 'PENDING_SCI_PAYMENT';
        let statusType = 'pending';
        let statusLabel = isSciToPay ? 'À régler par la SCI' : 'En attente de validation';
        if (exp.status === 'VALIDATED') {
          statusType = 'verified';
          statusLabel = 'Validé (crédité trésorerie)';
        } else if (exp.status === 'PAID') {
          statusType = 'paid';
          statusLabel = 'Réglé par la SCI';
        } else if (exp.status === 'REJECTED') {
          statusType = 'refund';
          statusLabel = 'Refusé';
        }

        let dateFormatted = exp.expense_date || '';
        if (dateFormatted.length === 10 && dateFormatted.includes('-')) {
          const [y, m, d] = dateFormatted.split('-');
          dateFormatted = `${d}/${m}/${y}`;
        }

        const supplier = exp.title.includes(' - ') ? exp.title.split(' - ')[0] : exp.title;
        const refName = exp.document_filename || `FAC-${exp.id}`;

        return {
          id: exp.id,
          date: dateFormatted,
          dueDate: isSciToPay ? 'Facture fournisseur SCI' : 'Avance associée',
          dueWarning: isSciToPay && exp.status !== 'PAID',
          supplier: supplier,
          reference: refName,
          amount: `${Number(exp.amount || 0).toFixed(2).replace('.', ',')} €`,
          taxInfo: isSciToPay ? 'Facture SCI' : 'Avance membre',
          statusType: statusType,
          status: statusLabel,
          filename: exp.document_filename || (exp.document_url ? exp.document_url.split('/').pop() : 'Facture.pdf'),
          document_url: exp.document_url,
          file_url: exp.document_url,
          payerType: exp.payer_type,
          memberId: exp.member_id,
          memberPrenom: exp.member_prenom || '',
          memberName: exp.member_prenom ? `${exp.member_prenom} Jamet` : 'Associé',
          rawExpense: exp
        };
      }) : [];

      setInvoices([...formattedCalls, ...formattedExpenses]);
    } catch (err) {
      console.warn('Erreur chargement factures:', err.message);
    }
  };

  const handleSyncBank = async () => {
    try {
      await triggerBankSync();
    } catch (syncErr) {
      console.warn('Synchronisation bancaire manuelle:', syncErr.message);
    }
    await loadBankStatus({ forceRefresh: true });
    await loadInvoices();
    setTreasuryRefreshTrigger((prev) => prev + 1);
  };

  useEffect(() => {
    // 1. Chargement et affichage immédiat du solde bancaire en cache
    loadBankStatus();
    loadDocuments();
    loadCategories();
    loadInvoices();

    // 2. Déclenchement systématique en arrière-plan de la synchronisation bancaire en direct à chaque montage / rafraîchissement
    // (triggerBankSync exécute déjà ReconciliationService.run_reconciliation(db) côté backend)
    triggerBankSync()
      .then(async () => {
        try {
          await loadBankStatus({ forceRefresh: true });
          await loadInvoices();
          setTreasuryRefreshTrigger((prev) => prev + 1);
        } catch (refreshErr) {
          console.warn('Notice actualisation post-sync bancaire:', refreshErr.message);
        }
      })
      .catch((syncErr) => {
        console.warn('Synchronisation bancaire en tâche de fond non bloquante:', syncErr.message);
      });
  }, []);

  useEffect(() => {
    // Traitement du retour de consentement Open Banking Tilisy / Swan
    const searchParams = new URLSearchParams(window.location.search);
    const bankingParam = searchParams.get('banking');
    if (bankingParam === 'success') {
      setBankingError(null);
      showToast('Liaison bancaire validée', 'Le consentement DSP2 Indy (Swan) a été renouvelé avec succès.', 'check_circle');
      window.history.replaceState({}, '', window.location.pathname);
      loadBankStatus({ forceRefresh: true });
      setTreasuryRefreshTrigger((prev) => prev + 1);
    } else if (bankingParam === 'error') {
      const rawMsg = searchParams.get('msg') || 'Le consentement bancaire a été annulé ou a échoué.';
      let msg = rawMsg;
      try {
        msg = decodeURIComponent(rawMsg);
      } catch (e) {
        msg = rawMsg;
      }
      setBankingError(msg);
      showToast('Erreur bancaire', msg, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Additional SCI Features (Grand Livre Financier)
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [financialModalTab, setFinancialModalTab] = useState('grand_livre');

  // Visionneuse universelle intégrée (Annotation 9)
  const [viewerDoc, setViewerDoc] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Générateur d'URL pour les factures / avis d'appel de fonds générés à la volée (Annotation 1)
  const getGeneratedInvoicePdfUrl = (doc, download = false) => {
    if (!doc) return '';
    let callId = doc.callId || doc.rawCall?.id;
    if (!callId && doc.id) {
      const idStr = String(doc.id);
      if (idStr.startsWith('cff-')) {
        callId = idStr.replace('cff-', '');
      } else if (/^\d+$/.test(idStr)) {
        callId = idStr;
      }
    }
    if (callId) {
      const digitsOnly = String(callId).replace(/\D/g, '');
      if (digitsOnly) callId = digitsOnly;
    }
    const memberName = doc.memberName || doc.memberPrenom || doc.rawCall?.member_name || doc.rawExpense?.member_prenom || currentUserName || 'Associé';
    const period = doc.dueDate || doc.rawCall?.period_label || doc.date || '';
    const rawAmount = doc.amount || doc.rawCall?.net_amount || doc.rawCall?.amount_due || doc.rawExpense?.amount || '';
    const amount = String(rawAmount).replace('€', '').replace(',', '.').replace(/\s+/g, '').trim();
    const ref = doc.reference || doc.rawCall?.reference || (doc.rawExpense ? `FAC-${doc.rawExpense.id}` : (doc.filename ? doc.filename.replace(/\.pdf$/i, '') : ''));
    const statusLabel = doc.status || doc.rawCall?.status || (doc.statusType === 'paid' ? 'Réglé' : 'Appel de fonds émis');

    const params = new URLSearchParams();
    if (callId) params.append('call_id', String(callId));
    if (memberName) params.append('member_name', String(memberName));
    if (period) params.append('period', String(period));
    if (amount) params.append('amount', String(amount));
    if (ref) params.append('ref', String(ref));
    if (statusLabel) params.append('status_label', String(statusLabel));
    if (download) params.append('download', 'true');

    return `/api/finances/invoices/generate-pdf?${params.toString()}`;
  };

  const handleInvoiceAction = (inv, action = 'view') => {
    if (action === 'download') {
      handleDownload(inv);
    } else {
      handleViewDocument(inv);
    }
  };

  const handleViewDocument = (doc) => {
    let resolved = null;
    if (typeof doc === 'string') {
      const isCall = doc.startsWith('SCI ') && doc.includes('Avis Appel de Fonds');
      resolved = {
        filename: doc,
        file_url: doc.startsWith('/api/') ? doc : (isCall ? getGeneratedInvoicePdfUrl({ filename: doc, isCallForFunds: true }, false) : `/api/documents/${encodeURIComponent(doc)}/download`)
      };
    } else if (doc) {
      const isCall = doc.isCallForFunds || (doc.filename && doc.filename.startsWith('SCI ') && doc.filename.includes('Avis Appel de Fonds')) || (doc.id && String(doc.id).startsWith('cff-'));
      const isInvoiceOrExpense = isCall || doc.rawExpense || (doc.supplier && doc.supplier.includes('Appel de fonds')) || (doc.dueDate && doc.dueDate.includes('Facture'));
      let url = doc.file_url || doc.url || doc.document_url || '';
      if (isCall || isInvoiceOrExpense) {
        url = getGeneratedInvoicePdfUrl(doc, false);
      } else if (doc.id && !isCall) {
        url = `/api/documents/${doc.id}/download`;
      }
      resolved = {
        ...doc,
        filename: doc.filename || doc.file_name || doc.name || doc.title || 'Facture.pdf',
        file_url: url,
        url: url,
        document_url: url,
        file_type: 'application/pdf',
      };
    }
    if (resolved) {
      setViewerDoc(resolved);
      setIsViewerOpen(true);
    }
  };

  // Téléchargement réel de document
  const handleDownload = (doc) => {
    let targetUrl = '';
    let targetName = 'document.pdf';
    if (typeof doc === 'string') {
      targetName = doc;
      const isCall = doc.startsWith('SCI ') && doc.includes('Avis Appel de Fonds');
      targetUrl = doc.startsWith('/api/') ? doc : (isCall ? getGeneratedInvoicePdfUrl({ filename: doc, isCallForFunds: true }, true) : `/api/documents/${encodeURIComponent(doc)}/download`);
    } else if (doc) {
      targetName = doc.filename || doc.file_name || doc.name || doc.title || 'Facture.pdf';
      const isCall = doc.isCallForFunds || (targetName.startsWith('SCI ') && targetName.includes('Avis Appel de Fonds')) || (doc.id && String(doc.id).startsWith('cff-'));
      const isInvoiceOrExpense = isCall || doc.rawExpense || (doc.supplier && doc.supplier.includes('Appel de fonds')) || (doc.dueDate && doc.dueDate.includes('Facture'));
      if (isCall || isInvoiceOrExpense) {
        targetUrl = getGeneratedInvoicePdfUrl(doc, true);
      } else if (doc.file_url || doc.url || doc.document_url) {
        targetUrl = doc.file_url || doc.url || doc.document_url;
      } else if (doc.id && !isCall) {
        targetUrl = `/api/documents/${doc.id}/download`;
      }
    }

    if (targetUrl) {
      const a = document.createElement('a');
      a.href = targetUrl;
      a.download = targetName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Téléchargement lancé', targetName, 'download');
    } else {
      showToast('Document indisponible', 'Le fichier lié n\'a pas pu être localisé.', 'warning');
    }
  };

  // Suppression d'un document réel
  const handleDeleteDoc = async (doc) => {
    const docId = doc.id || doc.filename;
    const docTitle = doc.title || doc.filename;
    if (!window.confirm(`Confirmez-vous la suppression du document « ${docTitle} » ?`)) return;
    try {
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id && d.filename !== doc.filename));
      setTreasuryRefreshTrigger((prev) => prev + 1);
      showToast('Document supprimé', `« ${docTitle} » a été supprimé.`, 'delete');
    } catch (err) {
      showToast('Erreur suppression', err.message, 'error');
    }
  };

  // Actions coordinateur sur les avances/factures membres
  const handleValidateInvoice = async (inv) => {
    const expId = inv?.rawExpense?.id ?? inv?.id;
    if (!expId) return;
    try {
      await validateMemberExpense(expId);
      await loadInvoices();
      setTreasuryRefreshTrigger((prev) => prev + 1);
      showToast('Avance validée', 'Le compte courant associé et l\'appel de fonds ont été mis à jour.', 'check_circle');
    } catch (err) {
      showToast('Erreur validation', err.message, 'error');
    }
  };

  const handleRejectInvoice = async (inv, reason = 'Justificatif non conforme') => {
    const expId = inv?.rawExpense?.id ?? inv?.id;
    if (!expId) return;
    try {
      await rejectMemberExpense(expId, reason);
      await loadInvoices();
      setTreasuryRefreshTrigger((prev) => prev + 1);
      showToast('Avance refusée', 'La facture a été marquée comme refusée.', 'check_circle');
    } catch (err) {
      showToast('Erreur refus', err.message, 'error');
    }
  };

  const handleDeleteInvoice = async (inv) => {
    const expId = inv?.rawExpense?.id ?? inv?.id;
    if (!expId) return;
    try {
      await deleteMemberExpense(expId);
      await loadInvoices();
      setTreasuryRefreshTrigger((prev) => prev + 1);
      showToast('Facture supprimée', 'L\'écriture correspondante a été retirée.', 'delete');
    } catch (err) {
      showToast('Erreur suppression', err.message, 'error');
    }
  };

  // Rename & Edit document tags workflow (Annotation 2 & 6)
  const openRenameModal = (doc) => {
    setSelectedRenamingDoc(doc);
    setRenameInputValue(doc.title || doc.name || '');
    const currentTags = parseDocumentTags(doc);
    setRenameDocTags(currentTags.length > 0 ? currentTags : (doc.category ? [doc.category] : ['Travaux & Chantiers']));
    setIsRenameModalOpen(true);
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRenamingDoc || !renameInputValue.trim()) return;

    const newTitle = renameInputValue.trim();
    const docId = selectedRenamingDoc.id || selectedRenamingDoc.filename;
    try {
      const finalTags = renameDocTags.length > 0 ? renameDocTags : ['Travaux & Chantiers'];
      const updated = await updateDocument(docId, {
        title: newTitle,
        tags: finalTags,
        category: finalTags.join(', ')
      });
      setDocuments((prev) =>
        prev.map((d) => (d.id === selectedRenamingDoc.id ? {
          ...d,
          ...updated,
          title: newTitle,
          name: newTitle,
          tags: finalTags,
          category: finalTags.join(', ')
        } : d))
      );
      setIsRenameModalOpen(false);
      showToast('Document actualisé', 'Le titre et les étiquettes ont été enregistrés avec succès.', 'check_circle');
    } catch (err) {
      showToast('Erreur modification', err.message, 'error');
    }
  };

  // Création d'une catégorie maison en base (Annotation 5)
  const handleCreateCategorySubmit = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setIsCreatingCat(true);
    try {
      const created = await createDocumentCategory({
        name: newCatName.trim(),
        emoji: newCatEmoji || '📁',
        color: newCatColor || 'slate'
      });
      setCategoriesList((prev) => {
        const exists = prev.find((c) => c.name.toLowerCase() === created.name.toLowerCase());
        if (exists) return prev;
        return [...prev, created];
      });
      setUploadCategory(created.name);
      setNewCatName('');
      setIsNewCategoryOpen(false);
      showToast('Catégorie créée', `Catégorie « ${created.name} » enregistrée en base.`, 'category');
    } catch (err) {
      showToast('Erreur', err.message, 'error');
    } finally {
      setIsCreatingCat(false);
    }
  };

  // Annotation 10 & Demande Henri : Ouverture de la modale d'édition de l'étiquette sélectionnée
  const handleOpenEditCategoryModal = (targetCategory = null) => {
    let current = null;
    const targetName = typeof targetCategory === 'string' ? targetCategory : (targetCategory?.name || selectedCategory);

    if (targetName && targetName !== 'all') {
      current = categoriesList.find((c) => c.name.toLowerCase() === targetName.toLowerCase());
      if (!current) {
        current = { id: `virtual-${targetName}`, name: targetName, emoji: '📁', color: 'slate', isVirtual: true };
      }
    }

    if (!current) {
      current = categoriesList.find((c) => c.name === uploadCategory) || categoriesList[0];
    }

    if (!current) {
      showToast('Aucune étiquette', 'Veuillez d\'abord sélectionner une étiquette.', 'warning');
      return;
    }
    setSelectedEditingCat(current);
    setEditCatName(current.name);
    setEditCatEmoji(current.emoji || '📁');
    setEditCatColor(current.color || 'slate');
    setIsEditCategoryModalOpen(true);
  };

  // Annotation 10 : Mise à jour de catégorie (PUT)
  const handleUpdateCategorySubmit = async (e) => {
    e.preventDefault();
    if (!selectedEditingCat || !editCatName.trim()) return;
    setIsUpdatingCat(true);
    try {
      let updated;
      const isNumericId = typeof selectedEditingCat.id === 'number' || (typeof selectedEditingCat.id === 'string' && /^\d+$/.test(selectedEditingCat.id));
      if (isNumericId) {
        updated = await updateDocumentCategory(selectedEditingCat.id, {
          name: editCatName.trim(),
          emoji: editCatEmoji || '📁',
          color: editCatColor || 'slate'
        });
      } else {
        // Catégorie virtuelle : création en base
        updated = await createDocumentCategory({
          name: editCatName.trim(),
          emoji: editCatEmoji || '📁',
          color: editCatColor || 'slate'
        });
      }

      setCategoriesList((prev) => {
        const withoutOld = prev.filter((c) => c.id !== selectedEditingCat.id && c.name.toLowerCase() !== selectedEditingCat.name.toLowerCase());
        return [...withoutOld, updated];
      });

      if (uploadCategory === selectedEditingCat.name) {
        setUploadCategory(updated.name);
      }
      if (selectedCategory === selectedEditingCat.name) {
        setSelectedCategory(updated.name);
      }

      // Propager le renommage dans tous les documents locaux
      setDocuments((prev) => prev.map((doc) => {
        const docTags = parseDocumentTags(doc);
        if (docTags.includes(selectedEditingCat.name) || doc.category === selectedEditingCat.name) {
          const newTags = docTags.map((t) => (t === selectedEditingCat.name ? updated.name : t));
          return {
            ...doc,
            tags: newTags,
            category: newTags.join(', ')
          };
        }
        return doc;
      }));

      // Si le document en cours d'édition est ouvert dans la modal rename
      setRenameDocTags((prev) => prev.map((t) => (t === selectedEditingCat.name ? updated.name : t)));

      setIsEditCategoryModalOpen(false);
      showToast('Étiquette mise à jour', `Étiquette « ${updated.name} » actualisée avec succès.`, 'check_circle');
    } catch (err) {
      showToast('Erreur mise à jour', err.message, 'error');
    } finally {
      setIsUpdatingCat(false);
    }
  };

  // Annotation 10 : Suppression de catégorie avec confirmation préalable obligatoire (DELETE)
  const handleDeleteCategory = async () => {
    if (!selectedEditingCat) return;
    if (window.confirm(`Êtes-vous certain de vouloir supprimer l'étiquette « ${selectedEditingCat.name} » ?`)) {
      setIsDeletingCat(true);
      try {
        const isNumericId = typeof selectedEditingCat.id === 'number' || (typeof selectedEditingCat.id === 'string' && /^\d+$/.test(selectedEditingCat.id));
        if (isNumericId) {
          await deleteDocumentCategory(selectedEditingCat.id);
        }
        const remaining = categoriesList.filter((c) => c.id !== selectedEditingCat.id && c.name !== selectedEditingCat.name);
        setCategoriesList(remaining);

        // Mettre à jour les documents
        setDocuments((prev) => prev.map((doc) => {
          const docTags = parseDocumentTags(doc);
          if (docTags.includes(selectedEditingCat.name) || doc.category === selectedEditingCat.name) {
            const newTags = docTags.filter((t) => t !== selectedEditingCat.name);
            const finalTags = newTags.length > 0 ? newTags : ['Autre'];
            return {
              ...doc,
              tags: finalTags,
              category: finalTags.join(', ')
            };
          }
          return doc;
        }));

        setRenameDocTags((prev) => prev.filter((t) => t !== selectedEditingCat.name));

        if (uploadCategory === selectedEditingCat.name) {
          setUploadCategory(remaining.length > 0 ? remaining[0].name : '');
        }
        if (selectedCategory === selectedEditingCat.name) {
          setSelectedCategory('all');
        }
        setIsEditCategoryModalOpen(false);
        showToast('Étiquette supprimée', `L'étiquette « ${selectedEditingCat.name} » a été supprimée.`, 'delete');
      } catch (err) {
        showToast('Erreur suppression', err.message, 'error');
      } finally {
        setIsDeletingCat(false);
      }
    }
  };

  // Calcul dynamique du nom de fichier canonique : [ORGANISME] [MMAAAA] [Titre].[ext]
  const getCanonicalFileName = useMemo(() => {
    const org = (uploadOrganisme || '').trim() || 'ORGANISME';
    const title = (uploadTitle || '').trim() || 'Titre du document';
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const mmaaaa = `${mm}${yyyy}`;

    let ext = '.pdf';
    if (uploadedFileName) {
      const lastDot = uploadedFileName.lastIndexOf('.');
      if (lastDot !== -1) {
        ext = uploadedFileName.substring(lastDot);
      }
    }
    return `${org} ${mmaaaa} ${title}${ext}`;
  }, [uploadOrganisme, uploadTitle, uploadedFileName]);

  // Upload document success callback (DRY unifié via UploadDocumentModal)
  const handleUploadSuccess = async (newDoc) => {
    setDocuments((prev) => [newDoc, ...prev]);
    await loadDocuments();
    await loadCategories();
    await loadInvoices();
    setTreasuryRefreshTrigger((prev) => prev + 1);
    showToast('Document archivé', `« ${newDoc.filename || newDoc.name} » a été archivé avec succès.`, 'cloud_done');
  };

  // Callbacks documents pour l'opération financière (Annotation 16 - DRY radical)
  const handleOpUploadSuccess = async (newDoc) => {
    if (!newDoc) return;
    setOperationDocument(newDoc);
    setOperationFile(null);
    setOperationFileName(newDoc.filename || newDoc.name || newDoc.title || 'Document justificatif');
    setOperationFileError('');
    setIsOpUploadModalOpen(false);
    showToast('Justificatif rattaché', `Le document « ${newDoc.filename || newDoc.name || newDoc.title} » a été archivé et sélectionné.`, 'attach_file');
    await loadDocuments();
  };

  const handleOpSelectExistingSuccess = (selectedDocs) => {
    if (!selectedDocs || selectedDocs.length === 0) return;
    const doc = selectedDocs[0];
    setOperationDocument(doc);
    setOperationFile(null);
    setOperationFileName(doc.filename || doc.file_name || doc.name || doc.title || 'Document existant');
    setOperationFileError('');
    setIsOpSelectExistingModalOpen(false);
    showToast('Document associé', `« ${doc.filename || doc.file_name || doc.title || doc.name} » a été sélectionné comme justificatif.`, 'check_circle');
  };

  const handleDetachOperationDoc = () => {
    setOperationDocument(null);
    setOperationFile(null);
    setOperationFileName('');
    setOperationFileError('');
  };

  // Operation workflow (Annotations 5, 6, 7 & 16 — Sortie Exclusive, Justification & Facture obligatoires)
  const handleOperationSubmit = async (e) => {
    e.preventDefault();
    setOperationFileError('');
    setOperationLabelError('');

    const amountNum = parseFloat(operationAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast('Montant invalide', 'Veuillez saisir un montant valide supérieur à 0 €.', 'warning');
      return;
    }

    if (!operationLabel || !operationLabel.trim()) {
      setOperationLabelError('La justification de paiement est obligatoire.');
      showToast('Justification obligatoire', 'Veuillez renseigner la justification de paiement.', 'warning');
      return;
    }

    if (!operationDocument && !operationFile) {
      const errorMsg = 'Veuillez joindre une facture ou un justificatif de paiement pour valider la dépense.';
      setOperationFileError(errorMsg);
      showToast('Justificatif obligatoire', errorMsg, 'warning');
      return;
    }

    setIsSubmittingOperation(true);
    try {
      const deposant = (
        currentUser && typeof currentUser === 'object'
          ? (currentUser.name || currentUser.fullName || (currentUser.prenom ? `${currentUser.prenom} ${currentUser.nom || ''}`.trim() : null) || currentUser.id)
          : (typeof currentUser === 'string' && currentUser ? currentUser : null)
      ) || (typeof activeUser === 'string' ? activeUser : 'Henri Jamet');

      const formData = new FormData();
      if (operationDocument && operationDocument.id) {
        formData.append('document_id', String(operationDocument.id));
      } else if (operationFile) {
        formData.append('file', operationFile);
      }
      formData.append('justification', operationLabel.trim());
      formData.append('amount', String(amountNum));
      formData.append('booking_date', operationDate || new Date().toISOString().split('T')[0]);
      formData.append('type', 'out');
      formData.append('uploaded_by', deposant);

      await createAccountingTransaction(formData);

      // Mise à jour réactive des totaux financiers (sorties déduites, réserves ajustées)
      setFinancialTotals((prev) => ({
        ...prev,
        sorties: (prev.sorties !== null ? prev.sorties : 0) + amountNum,
        reserves: prev.reserves !== null ? prev.reserves - amountNum : -amountNum
      }));

      // Rechargement dynamique des documents pour affichage direct du justificatif
      await loadDocuments();
      await loadInvoices();
      setTreasuryRefreshTrigger((prev) => prev + 1);

      setIsOperationModalOpen(false);
      showToast(
        'Dépense enregistrée',
        `-${amountNum.toFixed(2)} € — ${operationLabel.trim()} (Justificatif archivé)`,
        'payments'
      );

      // Réinitialisation du formulaire
      setOperationAmount('');
      setOperationLabel('');
      setOperationFile(null);
      setOperationDocument(null);
      setOperationFileName('');
      setOperationFileError('');
      setOperationLabelError('');
    } catch (err) {
      console.error('Erreur enregistrement dépense:', err);
      showToast('Erreur', err.message || 'Impossible d\'enregistrer la dépense', 'error');
    } finally {
      setIsSubmittingOperation(false);
    }
  };

  // Pre-fill operation for quick invoice payment
  const openPayInvoiceOperation = (inv) => {
    const rawVal = inv?.amount ? String(inv.amount).replace('€', '').replace(/\s/g, '').replace(',', '.') : '';
    setOperationType('out');
    setOperationAmount(parseFloat(rawVal) || '');
    setOperationLabel(`Règlement Facture ${inv.supplier} (${inv.reference})`);
    setOperationFile(null);
    setOperationDocument(null);
    setOperationFileName('');
    setOperationFileError('');
    setOperationLabelError('');
    setIsOperationModalOpen(true);
  };

  // Filter & Search Documents (Données réelles et Multi-Tags)
  const filteredDocuments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return documents
      .filter((doc) => {
        // ANNOTATION 1 : Exclure formellement tout appel de fonds pour ne pas polluer les documents administratifs généraux
        const docTitleRaw = doc.title || doc.name || doc.filename || doc.file_name || '';
        if (doc.isCallForFunds || doc.source_type === 'CALL_FOR_FUNDS' || (docTitleRaw.startsWith('SCI ') && docTitleRaw.includes('Avis Appel de Fonds'))) {
          return false;
        }

        const docTags = parseDocumentTags(doc);
        const matchesCategory =
          selectedCategory === 'all' ||
          docTags.includes(selectedCategory) ||
          doc.category === selectedCategory;

        const docTitle = docTitleRaw.toLowerCase();
        const docAuthor = (doc.uploaded_by || doc.author || '').toLowerCase();
        const docOrg = (doc.notes || '').toLowerCase();
        const docTagsStr = docTags.join(' ').toLowerCase();

        const matchesSearch =
          q === '' ||
          docTitle.includes(q) ||
          docAuthor.includes(q) ||
          docOrg.includes(q) ||
          docTagsStr.includes(q) ||
          (doc.category || '').toLowerCase().includes(q);

        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        const titleA = a.title || a.name || a.filename || '';
        const titleB = b.title || b.name || b.filename || '';
        if (sortCriteria === 'name') {
          return titleA.localeCompare(titleB);
        } else if (sortCriteria === 'size') {
          return (b.file_size || b.sizeBytes || 0) - (a.file_size || a.sizeBytes || 0);
        } else {
          return new Date(b.created_at || b.date || 0).getTime() - new Date(a.created_at || a.date || 0).getTime();
        }
      });
  }, [documents, searchQuery, selectedCategory, sortCriteria]);

  // Affichage progressif / Pagination au scroll (Annotation 7 : 20 premiers par défaut, +20 au scroll)
  const [visibleDocCount, setVisibleDocCount] = useState(20);
  const loadMoreDocsRef = useRef(null);

  // Réinitialiser la pagination si les filtres ou la recherche changent
  useEffect(() => {
    setVisibleDocCount(20);
  }, [searchQuery, selectedCategory, sortCriteria]);

  const displayedDocuments = useMemo(() => {
    return filteredDocuments.slice(0, visibleDocCount);
  }, [filteredDocuments, visibleDocCount]);

  // IntersectionObserver pour charger les 20 documents suivants au scroll
  useEffect(() => {
    const sentinel = loadMoreDocsRef.current;
    if (!sentinel || visibleDocCount >= filteredDocuments.length) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleDocCount((prev) => Math.min(prev + 20, filteredDocuments.length));
      }
    }, { rootMargin: '300px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleDocCount, filteredDocuments.length]);

  // Dynamic Category Counts (comptage par étiquette individuelle)
  const categoryCounts = useMemo(() => {
    const counts = { all: documents.length };
    documents.forEach((d) => {
      const docTags = parseDocumentTags(d);
      if (docTags.length === 0) {
        const fallback = d.category || 'Autre';
        counts[fallback] = (counts[fallback] || 0) + 1;
      } else {
        docTags.forEach((t) => {
          counts[t] = (counts[t] || 0) + 1;
        });
      }
    });
    return counts;
  }, [documents]);

  // Fusion dynamique des catégories en base et des documents existants
  const categories = useMemo(() => {
    const base = [{ key: 'all', label: `Tous (${documents.length})`, emoji: '📁' }];
    
    // Ajout des catégories issues de la base
    const seen = new Set();
    categoriesList.forEach((c) => {
      seen.add(c.name);
      base.push({
        key: c.name,
        label: `${c.emoji || '📁'} ${c.name} (${categoryCounts[c.name] || 0})`,
        emoji: c.emoji || '📁',
        color: c.color || 'slate'
      });
    });

    // Compléter avec les étiquettes présentes dans les documents qui ne seraient pas dans categoriesList
    documents.forEach((d) => {
      const docTags = parseDocumentTags(d);
      docTags.forEach((tag) => {
        if (tag && !seen.has(tag)) {
          seen.add(tag);
          base.push({
            key: tag,
            label: `📁 ${tag} (${categoryCounts[tag] || 0})`,
            emoji: '📁',
            color: 'slate'
          });
        }
      });
    });

    return base;
  }, [categoriesList, documents, categoryCounts]);

  return (
    <div className="w-full pb-16 animate-in fade-in duration-200">
      
      {/* ========================================================================= */}
      {/* 1. EN-TÊTE HARMONISÉ HERO                                                 */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-50/80 via-pink-50/60 to-purple-50/50 border border-rose-200/70 dark:bg-rose-950/20 dark:border-rose-800/40 p-6 sm:p-8 shadow-sm mb-6">
        {/* Subtle decorative glow */}
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-rose-200/40 dark:bg-rose-900/15 blur-3xl pointer-events-none"></div>
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-pink-200/30 dark:bg-pink-900/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100/90 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200 font-label-sm text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-400 animate-pulse"></span>
              DOMAINE D'HELLENVILLIERS • ADMINISTRATION
            </span>
            <h1 className="font-display-lg text-2xl sm:text-3xl lg:text-display-lg text-forest-deep dark:text-rose-50 tracking-tight font-bold mt-2">
              Administratif &amp; Documents
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant dark:text-rose-200/80 leading-relaxed">
              Portail Familial &amp; Patrimonial • Suivi budgétaire, actes notariés et pièces justificatives
            </p>
          </div>

          {/* Quick Actions Buttons */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 pt-2 md:pt-0">
            <button
              id="btn-open-operation"
              type="button"
              onClick={() => {
                setOperationType('out');
                setOperationFile(null);
                setOperationDocument(null);
                setOperationFileName('');
                setOperationFileError('');
                setOperationLabelError('');
                setIsOperationModalOpen(true);
              }}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-outline-variant text-on-surface hover:bg-canvas-slate hover:border-outline font-label-lg text-sm sm:text-base font-semibold transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[22px] text-on-surface-variant group-hover:scale-110 transition-transform">payments</span>
              <span>Déclarer une dépense</span>
            </button>

            <button
              id="btn-open-upload"
              type="button"
              onClick={() => {
                setUploadModalMode('document');
                setIsUploadModalOpen(true);
              }}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-sm sm:text-base font-bold shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">upload_file</span>
              <span>+ Déposer une pièce</span>
            </button>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION PRIORITAIRE HAUT DE PAGE : MES DERNIÈRES FACTURES & RÈGLEMENTS    */}
      {/* ========================================================================= */}
      <div className="mt-space-md mb-space-md bg-surface-container-lowest rounded-lg border border-border-subtle p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)]">
        {/* Header Encadré Personnel */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-sm border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-sage-soft flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-sm text-headline-sm text-forest-deep font-semibold">
                  Mes Dernières Factures &amp; Règlements — {currentUserName}
                </h2>
              </div>
              <p className="font-body-md text-xs text-on-surface-variant mt-0.5">
                Vue personnelle prioritaire • Suivi de vos factures directes, avances de frais et remboursements
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-open-upload-invoice-top"
              type="button"
              onClick={() => {
                setUploadModalMode('invoice');
                setIsUploadModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-primary text-on-primary hover:bg-forest-deep text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>+ Déposer une facture</span>
            </button>
            <span className="text-xs font-semibold text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-full">
              {myInvoices.length} {myInvoices.length <= 1 ? 'facture' : 'factures'}
            </span>
          </div>
        </div>

        {/* Table Body Personnel */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="text-xs uppercase text-on-surface-variant bg-surface-container-low/70 border-b border-border-subtle font-semibold">
              <tr>
                <th className="py-3 px-4" scope="col">Date &amp; Échéance</th>
                <th className="py-3 px-4" scope="col">Réf. Facture &amp; Prestataire</th>
                <th className="py-3 px-4" scope="col">Montant TTC</th>
                <th className="py-3 px-4" scope="col">Statut de paiement</th>
                <th className="py-3 px-4" scope="col">Justificatif</th>
                <th className="py-3 px-4 text-right" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle font-body-md text-sm text-on-surface">
              {myInvoices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 px-4 text-center text-on-surface-variant font-body-md text-xs">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <span className="material-symbols-outlined text-[28px] text-outline">receipt_long</span>
                      <span className="font-semibold text-forest-deep text-sm">Aucune facture personnelle enregistrée pour {currentUserName}</span>
                      <span className="text-on-surface-variant text-xs">
                        Déposez une facture ou une avance de frais pour la rattacher directement à votre trésorerie.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                myInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-canvas-slate/80 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-forest-deep">{inv.date}</div>
                      <div className={`text-xs ${inv.dueWarning ? 'text-amber-rich font-semibold' : 'text-on-surface-variant'}`}>
                        {inv.dueDate}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-on-surface">{inv.supplier}</div>
                      <div className="text-xs text-on-surface-variant font-mono">{inv.reference}</div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-headline-sm text-sm font-bold text-forest-deep tabular-nums">
                        {inv.amount}
                      </div>
                      <div className="text-[11px] text-on-surface-variant">{inv.taxInfo}</div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {inv.statusType === 'paid' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sage-soft text-forest-deep">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          <span>{inv.status}</span>
                        </span>
                      )}
                      {inv.statusType === 'pending' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-soft text-amber-rich">
                          <span className="material-symbols-outlined text-[14px]">pending</span>
                          <span>{inv.status}</span>
                        </span>
                      )}
                      {inv.statusType === 'verified' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sage-soft text-forest-deep">
                          <span className="material-symbols-outlined text-[14px]">verified</span>
                          <span>{inv.status}</span>
                        </span>
                      )}
                      {inv.statusType === 'refund' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-low text-primary border border-sage-border">
                          <span className="material-symbols-outlined text-[14px]">currency_exchange</span>
                          <span>{inv.status}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleInvoiceAction(inv, 'view');
                        }}
                        className="btn-download inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low text-forest-deep hover:bg-sage-soft border border-border-subtle transition-all text-xs font-semibold cursor-pointer"
                        title="Consulter le justificatif dans la visionneuse"
                      >
                        <span className="material-symbols-outlined text-error text-[16px]">picture_as_pdf</span>
                        <span>{inv.filename}</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleInvoiceAction(inv, 'view');
                          }}
                          className="btn-view px-2.5 h-8 rounded-DEFAULT bg-surface-container-lowest border border-primary text-primary hover:bg-sage-soft transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                          title="Consulter dans la visionneuse"
                        >
                          <span className="material-symbols-outlined text-[15px]">visibility</span>
                          <span>Consulter</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInvoiceAction(inv, 'download')}
                          className="btn-download px-2.5 h-8 rounded-DEFAULT bg-surface-container-lowest border border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                          title="Télécharger une copie du fichier"
                        >
                          <span className="material-symbols-outlined text-[15px]">download</span>
                          <span>Télécharger</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1 : FINANCIAL QUICK SUMMARY (3 HIGH-IMPACT KPI CARDS)             */}
      {/* ========================================================================= */}
      <div className="mt-space-lg">
        {/* Alerte persistante de retour d'erreur bancaire avec bouton explicite de fermeture */}
        {bankingError && (
          <aside
            id="banner-banking-error"
            role="alert"
            className="mb-space-md p-4 sm:p-5 rounded-2xl bg-rose-50/95 border-2 border-rose-400 text-rose-950 shadow-md flex items-start justify-between gap-4 animate-in fade-in duration-200"
          >
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center shrink-0 text-rose-700">
                <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base text-rose-950">
                    Échec du consentement bancaire Indy (Swan)
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-200 text-rose-900 border border-rose-300">
                    Erreur retour
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-rose-950 font-mono bg-rose-100/80 p-3 rounded-lg border border-rose-200 break-words select-text whitespace-pre-wrap">
                  {bankingError}
                </p>
                <p className="text-[11px] text-rose-700">
                  Ce message d'erreur reste affiché en permanence tant que vous ne l'avez pas fermé afin de vous permettre de copier le détail technique ou d'identifier le diagnostic.
                </p>
              </div>
            </div>
            <button
              id="btn-close-banking-error"
              type="button"
              onClick={() => setBankingError(null)}
              className="p-1.5 rounded-xl hover:bg-rose-200/80 active:bg-rose-300 text-rose-700 transition-colors shrink-0 cursor-pointer"
              title="Fermer l'erreur"
              aria-label="Fermer l'erreur bancaire"
            >
              <X className="w-5 h-5" />
            </button>
          </aside>
        )}

        {/* Bannière d'alerte raccordement bancaire DSP2 réactive */}
        <BankReauthBanner bankStatus={bankStatus} onRefresh={handleSyncBank} urlError={bankingError} />

        {/* Bannière d'alerte stockage Google Drive réactive (Fail-Loud) */}
        <DriveReauthBanner currentUser={currentUser} />

        <div className="flex items-center justify-between mb-space-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">account_balance</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              Synthèse Financière &amp; Trésorerie Dédiée
            </h2>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => {
                setFinancialModalTab('grand_livre');
                setIsFinancialModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-low hover:bg-sage-soft rounded-full text-forest-deep border border-border-subtle font-label-sm text-xs transition"
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>Consulter le Grand Livre</span>
            </button>
          </div>
        </div>

        {isLoadingBank ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            <BankMetricSkeleton />
            <BankMetricSkeleton />
            <BankMetricSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            
            {/* Card 1: Entrées / Cotisations CCA */}
            <div
              onClick={() => {
                setFinancialModalTab('entrees');
                setIsFinancialModalOpen(true);
              }}
              role="button"
              tabIndex={0}
              className="bg-surface-container-lowest rounded-lg p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] border border-border-subtle flex flex-col justify-between relative overflow-hidden group hover:border-primary hover:shadow-[0_8px_24px_-4px_rgba(6,95,70,0.09)] transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-space-xs">
                <div>
                  <span className="text-on-surface-variant font-label-sm text-label-sm block uppercase tracking-wider font-semibold">
                    Entrées (CCA &amp; Apports)
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="font-headline-lg text-headline-lg font-bold text-forest-deep tabular-nums">
                      {hasRealBankData && financialTotals.entrees !== null
                        ? `${financialTotals.entrees.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                        : '—'}
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-primary/40 group-hover:text-primary transition-colors text-[24px]">
                  arrow_downward
                </span>
              </div>
            </div>

            {/* Card 2: Sorties & Charges */}
            <div
              onClick={() => {
                setOperationType('out');
                setOperationFile(null);
                setOperationDocument(null);
                setOperationFileName('');
                setOperationFileError('');
                setOperationLabelError('');
                setIsOperationModalOpen(true);
              }}
              role="button"
              tabIndex={0}
              className="bg-surface-container-lowest rounded-lg p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] border border-border-subtle flex flex-col justify-between relative overflow-hidden group hover:border-primary hover:shadow-[0_8px_24px_-4px_rgba(6,95,70,0.09)] transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-space-xs">
                <div>
                  <span className="text-on-surface-variant font-label-sm text-label-sm block uppercase tracking-wider font-semibold">
                    Sorties &amp; Charges engagées
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="font-headline-lg text-headline-lg font-bold text-on-surface tabular-nums">
                      {hasRealBankData && financialTotals.sorties !== null
                        ? `${financialTotals.sorties.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                        : '—'}
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-amber-rich/40 group-hover:text-amber-rich transition-colors text-[24px]">
                  arrow_upward
                </span>
              </div>
            </div>

            {/* Card 3: Réserves & Trésorerie */}
            <div className="bg-surface-container-lowest rounded-lg p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] border border-border-subtle flex flex-col justify-between relative overflow-hidden group hover:border-sage-border transition-all">
              <div className="flex items-start justify-between gap-space-xs">
                <div>
                  <span className="text-on-surface-variant font-label-sm text-label-sm block uppercase tracking-wider font-semibold">
                    Réserves &amp; Trésorerie disponible
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="font-headline-lg text-headline-lg font-bold text-primary tabular-nums">
                      {hasRealBankData && financialTotals.reserves !== null
                        ? `${financialTotals.reserves.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                        : '—'}
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-primary/40 text-[24px]">
                  savings
                </span>
              </div>
              {!hasRealBankData && (
                <div className="mt-2 pt-2 border-t border-rose-100 flex items-center justify-between text-[11px] text-rose-800">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                    Liaison bancaire inactive ou à renouveler
                  </span>
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION TRÉSORERIE PAR MEMBRE & RAPPROCHEMENT BANCAIRE                    */}
      {/* ========================================================================= */}
      <MemberTreasurySection
        currentUser={currentUser}
        isCoordinator={isCoordinator}
        refreshTrigger={treasuryRefreshTrigger}
        onDeclarePayment={() => {
          setOperationType('virement');
          setOperationAmount('');
          setOperationDescription('');
          setOperationCategory('Trésorerie');
          setOperationDate(new Date().toISOString().split('T')[0]);
          setOperationFile(null);
          setOperationDocument(null);
          setOperationFileName('');
          setOperationFileError('');
          setOperationLabelError('');
          setIsOperationModalOpen(true);
        }}
        onDeclareExpense={() => {
          setOperationType('depense');
          setOperationAmount('');
          setOperationDescription('');
          setOperationCategory('Travaux & Factures');
          setOperationDate(new Date().toISOString().split('T')[0]);
          setOperationFile(null);
          setOperationDocument(null);
          setOperationFileName('');
          setOperationFileError('');
          setOperationLabelError('');
          setIsOperationModalOpen(true);
        }}
      />

      {/* ========================================================================= */}
      {/* SECTION 2 : TABLEAU DES DERNIÈRES FACTURES & RÈGLEMENTS                   */}
      {/* ========================================================================= */}
      <div className="mt-space-md bg-surface-container-lowest rounded-lg border border-border-subtle p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)]">
        
        {/* Table Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-sm border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-sage-soft flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-sm text-headline-sm text-forest-deep font-semibold">
                  Historique des Factures &amp; Règlements de Tous les Membres
                </h2>
              </div>
              <p className="font-body-md text-xs text-on-surface-variant mt-0.5">
                Vue coordinateur globale • Historique consolidé des factures directes SCI, avances de frais et remboursements
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-open-upload-invoice-global"
              type="button"
              onClick={() => {
                setUploadModalMode('invoice');
                setIsUploadModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-primary text-on-primary hover:bg-forest-deep text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>+ Déposer une facture</span>
            </button>
            <span className="text-xs font-semibold text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-full">
              {manualMemberExpenses.length} {manualMemberExpenses.length <= 1 ? 'facture manuelle' : 'factures manuelles'}
            </span>
          </div>
        </div>

        {/* Invoices Table Body — Limité à maximum 5 éléments visibles par défaut avec conteneur défilable verticalement (Annotation 2) */}
        <div className="mt-3 overflow-x-auto max-h-[320px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="text-xs uppercase text-on-surface-variant bg-surface-container-low/70 border-b border-border-subtle font-semibold sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4" scope="col">Date &amp; Échéance</th>
                <th className="py-3 px-4" scope="col">Membre Associé</th>
                <th className="py-3 px-4" scope="col">Réf. Facture &amp; Prestataire</th>
                <th className="py-3 px-4" scope="col">Montant TTC</th>
                <th className="py-3 px-4" scope="col">Statut de paiement</th>
                <th className="py-3 px-4" scope="col">Justificatif</th>
                <th className="py-3 px-4 text-right" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle font-body-md text-sm text-on-surface">
              {manualMemberExpenses.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 px-4 text-center text-on-surface-variant font-body-md text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[32px] text-outline">receipt_long</span>
                      <span className="font-semibold text-forest-deep text-sm">Aucun justificatif ou facture manuelle enregistré</span>
                      <span className="text-on-surface-variant text-xs max-w-sm">
                        Seules les factures fournisseurs SCI et avances de frais déposées manuellement par les membres sont affichées ici.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                manualMemberExpenses.map((inv) => (
                <tr key={inv.id} className="hover:bg-canvas-slate/80 transition-colors">
                  
                  {/* Date & Échéance */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="font-semibold text-forest-deep">{inv.date}</div>
                    <div className={`text-xs ${inv.dueWarning ? 'text-amber-rich font-semibold' : 'text-on-surface-variant'}`}>
                      {inv.dueDate}
                    </div>
                  </td>

                  {/* Membre Associé */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200">
                      <span className="material-symbols-outlined text-[14px]">person</span>
                      <span>{inv.memberName || 'Associé'}</span>
                    </span>
                  </td>

                  {/* Réf & Prestataire */}
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-on-surface">{inv.supplier}</div>
                    <div className="text-xs text-on-surface-variant font-mono">{inv.reference}</div>
                  </td>

                  {/* Montant TTC */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="font-headline-sm text-sm font-bold text-forest-deep tabular-nums">
                      {inv.amount}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{inv.taxInfo}</div>
                  </td>

                  {/* Statut de paiement */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {inv.statusType === 'paid' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sage-soft text-forest-deep">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        <span>{inv.status}</span>
                      </span>
                    )}
                    {inv.statusType === 'pending' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-soft text-amber-rich">
                        <span className="material-symbols-outlined text-[14px]">pending</span>
                        <span>{inv.status}</span>
                      </span>
                    )}
                    {inv.statusType === 'verified' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sage-soft text-forest-deep">
                        <span className="material-symbols-outlined text-[14px]">verified</span>
                        <span>{inv.status}</span>
                      </span>
                    )}
                    {inv.statusType === 'refund' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-low text-primary border border-sage-border">
                        <span className="material-symbols-outlined text-[14px]">currency_exchange</span>
                        <span>{inv.status}</span>
                      </span>
                    )}
                  </td>

                  {/* Justificatif */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleInvoiceAction(inv, 'view');
                      }}
                      className="btn-download inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low text-forest-deep hover:bg-sage-soft border border-border-subtle transition-all text-xs font-semibold cursor-pointer"
                      title="Consulter le justificatif dans la visionneuse"
                    >
                      <span className="material-symbols-outlined text-error text-[16px]">picture_as_pdf</span>
                      <span>{inv.filename}</span>
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleInvoiceAction(inv, 'view');
                        }}
                        className="btn-view px-2.5 h-8 rounded-DEFAULT bg-surface-container-lowest border border-primary text-primary hover:bg-sage-soft transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        title="Consulter dans la visionneuse"
                      >
                        <span className="material-symbols-outlined text-[15px]">visibility</span>
                        <span>Consulter</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleInvoiceAction(inv, 'download')}
                        className="btn-download px-2.5 h-8 rounded-DEFAULT bg-surface-container-lowest border border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        title="Télécharger une copie du fichier"
                      >
                        <span className="material-symbols-outlined text-[15px]">download</span>
                        <span>Télécharger</span>
                      </button>

                      {inv.statusType === 'pending' && (
                        <button
                          type="button"
                          onClick={() => openPayInvoiceOperation(inv)}
                          className="px-3 h-8 rounded-DEFAULT bg-primary text-on-primary hover:bg-forest-deep transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ml-1"
                        >
                          <span className="material-symbols-outlined text-[15px]">payments</span>
                          <span>Régler</span>
                        </button>
                      )}
                    </div>
                  </td>

                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* SECTION 3 : TOOLBAR & BIBLIOTHÈQUE DE DOCUMENTS STITCH                   */}
      {/* ========================================================================= */}
      <div className="mt-space-lg flex flex-col gap-space-sm">
        
        {/* Controls row : Search + Sort + View Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm">
          
          {/* Search Input */}
          <div className="relative flex-1 max-w-xl">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-[22px]">
              search
            </span>
            <input
              id="doc-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par titre, mot-clé, artisan, date..."
              className="w-full h-[52px] pl-12 pr-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Sorting & View Switcher */}
          <div className="flex items-center gap-space-sm flex-wrap">
            
            {/* Sort Select */}
            <div className="flex items-center gap-2">
              <label htmlFor="sort-select" className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap hidden sm:inline">
                Trier par :
              </label>
              <CustomSelect
                id="sort-select"
                value={sortCriteria}
                onChange={(e) => setSortCriteria(e.target.value)}
                options={[
                  { value: 'recent', label: 'Date (Plus récent en premier)', icon: 'schedule' },
                  { value: 'name', label: 'Nom alphabétique (A-Z)', icon: 'sort_by_alpha' },
                  { value: 'size', label: 'Taille de fichier', icon: 'data_usage' },
                ]}
                className="h-[52px] min-w-[240px]"
              />
            </div>

            {/* Bouton d'édition de l'étiquette sélectionnée (Annotation Report Henri) */}
            {selectedCategory && selectedCategory !== 'all' && (
              <button
                id="btn-edit-selected-category"
                type="button"
                onClick={() => handleOpenEditCategoryModal(selectedCategory)}
                className="h-[52px] px-4 rounded-DEFAULT bg-surface-container-lowest border border-border-subtle hover:border-primary text-on-surface hover:text-primary font-label-sm text-label-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer group"
                title={`Modifier ou supprimer l'étiquette « ${selectedCategory} »`}
              >
                <span className="material-symbols-outlined text-[18px] text-primary group-hover:scale-110 transition-transform">
                  edit_note
                </span>
                <span className="font-semibold whitespace-nowrap hidden sm:inline">
                  Modifier l'étiquette
                </span>
                <span className="font-semibold whitespace-nowrap sm:hidden">
                  Étiquette
                </span>
              </button>
            )}

            {/* View Switch (Grid vs List) */}
            <div className="flex items-center p-1 bg-surface-container-low rounded-DEFAULT border border-border-subtle">
              <button
                id="view-grid-btn"
                type="button"
                onClick={() => setViewMode('grid')}
                className={`h-10 px-3 flex items-center justify-center rounded-DEFAULT font-label-sm text-label-sm gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">grid_view</span>
                <span className="hidden sm:inline">Vignettes</span>
              </button>

              <button
                id="view-list-btn"
                type="button"
                onClick={() => setViewMode('list')}
                className={`h-10 px-3 flex items-center justify-center rounded-DEFAULT font-label-sm text-label-sm gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">format_list_bulleted</span>
                <span className="hidden sm:inline">Liste</span>
              </button>
            </div>

          </div>

        </div>

        {/* Category Filter Pills (7 Pills) */}
        <div id="category-filters" className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                className={`filter-pill px-4 py-2 rounded-full font-label-sm text-label-sm whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'active-pill bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-lowest text-on-surface-variant border border-border-subtle hover:border-primary hover:text-primary'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* SECTION 4 : DOCUMENTS DISPLAY (GRID VS LIST)                             */}
      {/* ========================================================================= */}
      {isDocsLoading ? (
        <div className="mt-space-lg p-space-xl bg-surface-container-lowest rounded-2xl border border-border-subtle text-center flex flex-col items-center justify-center shadow-xs">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mb-3"></div>
          <span className="text-sm font-semibold text-slate-700">Chargement des documents officiels...</span>
        </div>
      ) : documents.length === 0 ? (
        /* État vide sobre et net (Annotation 6) */
        <div id="documents-container" className="mt-space-lg p-space-xl bg-surface-container-lowest rounded-2xl border border-border-subtle text-center flex flex-col items-center justify-center shadow-xs">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline mb-space-sm">
            <span className="material-symbols-outlined text-[36px] text-slate-400">folder_open</span>
          </div>
          <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-semibold max-w-lg leading-relaxed">
            Aucun document archivé pour le moment. Cliquez sur « + Déposer une pièce » pour archiver un document.
          </h3>
          <button
            id="btn-empty-upload"
            type="button"
            onClick={() => {
              setUploadModalMode('document');
              setIsUploadModalOpen(true);
            }}
            className="mt-space-md inline-flex items-center gap-2 h-[48px] px-6 rounded-DEFAULT bg-primary text-white font-label-md text-sm font-bold shadow-xs hover:bg-forest-deep transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">upload_file</span>
            <span>+ Déposer une pièce</span>
          </button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        /* Filtre / Recherche sans résultat */
        <div id="no-docs-empty" className="mt-space-lg p-space-xl bg-surface-container-lowest rounded-2xl border border-border-subtle text-center flex flex-col items-center justify-center shadow-xs">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline mb-space-sm">
            <span className="material-symbols-outlined text-[32px] text-slate-400">search_off</span>
          </div>
          <h3 className="font-headline-sm text-base text-on-surface font-semibold">
            Aucun document trouvé pour cette recherche
          </h3>
          <p className="font-body-md text-xs text-on-surface-variant mt-1 max-w-md">
            Aucun document ne correspond à vos filtres actuels.
          </p>
          <button
            id="btn-reset-filters"
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="mt-space-md inline-flex items-center gap-2 h-[44px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-md text-xs font-semibold hover:bg-sage-soft transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            <span>Réinitialiser les filtres</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Layout (4 colonnes) */
        <div id="documents-container" className="mt-space-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter transition-opacity duration-200">
          {displayedDocuments.map((doc) => {
            const docExt = (doc.filename || doc.file_name || doc.file_url || '').split('.').pop()?.toUpperCase() || 'PDF';
            const docTags = parseDocumentTags(doc);
            const firstTag = docTags.length > 0 ? docTags[0] : (doc.category || 'Général');
            const firstCatObj = categoriesList.find((c) => c.name === firstTag);

            return (
              <div
                key={doc.id || doc.filename}
                className="doc-card group bg-surface-container-lowest rounded-lg border border-border-subtle p-space-sm flex flex-col justify-between shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] hover:border-sage-border hover:shadow-[0_8px_24px_-4px_rgba(6,95,70,0.09)] transition-all"
              >
                <div 
                  onClick={() => handleViewDocument(doc)} 
                  className="cursor-pointer group-hover:opacity-95 transition-opacity"
                  title="Cliquer pour consulter ce document"
                >
                  {/* Document Thumbnail Card */}
                  <div className="relative w-full h-44 rounded-DEFAULT bg-surface-container overflow-hidden flex flex-col justify-between p-3 border border-border-subtle/60">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-700 text-white uppercase shadow-xs">
                        {docExt}
                      </span>
                      <span className="text-xs text-on-surface-variant font-mono">
                        {doc.size || '—'}
                      </span>
                    </div>

                    {/* Stamp & Category Center (Mosaïque d'icônes si multi-tags) */}
                    <div className="flex flex-col items-center justify-center my-auto text-center px-2">
                      {docTags.length > 1 ? (
                        <div className="flex items-center justify-center gap-1.5 mb-1.5 flex-wrap max-w-full">
                          {docTags.slice(0, 3).map((tag) => {
                            const cat = categoriesList.find((c) => c.name === tag);
                            return (
                              <div
                                key={tag}
                                className="w-9 h-9 rounded-full flex items-center justify-center bg-sage-soft text-primary shadow-2xs border border-border-subtle"
                                title={tag}
                              >
                                <span className="text-lg">{cat?.emoji || '📁'}</span>
                              </div>
                            );
                          })}
                          {docTags.length > 3 && (
                            <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded-full">
                              +{docTags.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1 bg-sage-soft text-primary">
                          <span className="text-2xl">{firstCatObj?.emoji || '📁'}</span>
                        </div>
                      )}
                      <span className="font-headline-sm text-xs font-bold text-forest-deep line-clamp-1" title={doc.title || doc.name}>
                        {doc.title || doc.name}
                      </span>
                      <span className="text-[11px] text-on-surface-variant font-label-sm truncate max-w-full">
                        {doc.notes ? `Org : ${doc.notes}` : (docTags.length > 0 ? docTags.join(' • ') : (doc.category || 'Général'))}
                      </span>
                    </div>

                    {/* Bottom Strip */}
                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant bg-surface-container-lowest/80 backdrop-blur-xs px-2 py-1 rounded">
                      <span className="truncate max-w-[120px]">{doc.uploaded_by || 'Henri Jamet'}</span>
                      <span className="font-semibold text-primary">{doc.upload_date || 'Archivé'}</span>
                    </div>
                  </div>

                  {/* Document Metadata & Multi-Tags Mosaïque (Annotation 3) */}
                  <div className="mt-3">
                    <div className="doc-tags-mosaic flex items-center gap-1.5 flex-wrap mb-2 min-h-[26px]">
                      {docTags.length > 0 ? (
                        docTags.map((tag) => {
                          const cat = categoriesList.find((c) => c.name === tag);
                          const badgeColor = getTagColorClass(cat?.color);
                          return (
                            <span
                              key={tag}
                              className={`doc-tag-badge inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold border ${badgeColor} shadow-2xs`}
                            >
                              <span>{cat?.emoji || '📁'}</span>
                              <span>{tag}</span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-slate-100 text-slate-700 border-slate-200">
                          <span>📁</span>
                          <span>Sans étiquette</span>
                        </span>
                      )}
                    </div>
                    <h3
                      className="font-headline-sm text-sm text-forest-deep font-bold line-clamp-2 leading-tight doc-title-text"
                      title={doc.filename || doc.title}
                    >
                      {doc.filename || doc.title}
                    </h3>
                    <p className="font-body-md text-xs text-on-surface-variant mt-1">
                      {doc.upload_date || 'Date non renseignée'} • {doc.size || '—'} • {doc.uploaded_by || 'Henri Jamet'}
                    </p>
                  </div>
                </div>

                {/* Card Actions (Annotation 1 : Téléchargement supprimé des cartes directes, disponible dans le modal de consultation) */}
                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleViewDocument(doc);
                    }}
                    className="btn-view flex-1 h-[40px] px-3 rounded-DEFAULT bg-primary text-white font-label-sm text-xs hover:bg-forest-deep transition-all flex items-center justify-center gap-1.5 cursor-pointer font-bold shadow-xs"
                    title="Consulter le document"
                  >
                    <span className="material-symbols-outlined text-[17px]">visibility</span>
                    <span>Consulter</span>
                  </button>

                  <button
                    id={`btn-edit-doc-${doc.id || doc.filename}`}
                    type="button"
                    onClick={() => openRenameModal(doc)}
                    className="btn-rename p-2 h-[40px] w-[40px] rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all flex items-center justify-center cursor-pointer shrink-0"
                    title="Éditer le document (titre & étiquettes)"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(doc)}
                    className="p-2 h-[40px] w-[40px] rounded-DEFAULT bg-surface-container-lowest border-2 border-rose-200 text-rose-600 hover:bg-rose-50 transition-all flex items-center justify-center cursor-pointer shrink-0"
                    title="Supprimer définitivement"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List Layout */
        <div id="documents-container" className="mt-space-md flex flex-col gap-3 transition-opacity duration-200">
          {displayedDocuments.map((doc) => {
            const docTags = parseDocumentTags(doc);
            const firstTag = docTags.length > 0 ? docTags[0] : (doc.category || 'Général');
            const firstCatObj = categoriesList.find((c) => c.name === firstTag);

            return (
              <div
                key={doc.id || doc.filename}
                className="doc-card group bg-surface-container-lowest rounded-DEFAULT border border-border-subtle p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs hover:border-sage-border transition-all"
              >
                <div 
                  onClick={() => handleViewDocument(doc)} 
                  className="flex items-center gap-3 cursor-pointer group-hover:opacity-95 transition-opacity flex-1 min-w-0"
                  title="Cliquer pour consulter ce document"
                >
                  {docTags.length > 1 ? (
                    <div className="flex items-center -space-x-2 shrink-0">
                      {docTags.slice(0, 3).map((tag) => {
                        const cat = categoriesList.find((c) => c.name === tag);
                        return (
                          <div
                            key={tag}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-sage-soft text-primary border-2 border-white shadow-2xs text-lg"
                            title={tag}
                          >
                            {cat?.emoji || '📁'}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-sage-soft text-primary text-xl">
                      {firstCatObj?.emoji || '📁'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="doc-tags-mosaic flex items-center gap-1.5 flex-wrap">
                      {docTags.length > 0 ? (
                        docTags.map((tag) => {
                          const cat = categoriesList.find((c) => c.name === tag);
                          const badgeColor = getTagColorClass(cat?.color);
                          return (
                            <span
                              key={tag}
                              className={`doc-tag-badge inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${badgeColor} shadow-2xs`}
                            >
                              <span>{cat?.emoji || '📁'}</span>
                              <span>{tag}</span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-slate-100 text-slate-700 border-slate-200">
                          <span>📁</span>
                          <span>Sans étiquette</span>
                        </span>
                      )}
                      <span className="text-xs font-mono text-on-surface-variant ml-1">{doc.size || '—'}</span>
                    </div>
                    <h3 className="font-headline-sm text-sm text-forest-deep font-bold line-clamp-1 doc-title-text mt-1 truncate" title={doc.filename || doc.title}>
                      {doc.filename || doc.title}
                    </h3>
                    <p className="font-body-md text-xs text-on-surface-variant truncate mt-0.5">
                      {doc.upload_date || 'Date'} • Déposant : {doc.uploaded_by || 'Henri Jamet'} {doc.notes ? `• Org : ${doc.notes}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleViewDocument(doc);
                    }}
                    className="btn-view h-[38px] px-3.5 rounded-DEFAULT bg-primary text-white font-label-sm text-xs hover:bg-forest-deep transition-all flex items-center gap-1.5 cursor-pointer font-bold shadow-xs"
                    title="Consulter ce document"
                  >
                    <span className="material-symbols-outlined text-[17px]">visibility</span>
                    <span>Consulter</span>
                  </button>
                  <button
                    id={`btn-edit-doc-list-${doc.id || doc.filename}`}
                    type="button"
                    onClick={() => openRenameModal(doc)}
                    className="btn-rename p-2 h-[38px] w-[38px] rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all flex items-center justify-center cursor-pointer"
                    title="Éditer le document (titre & étiquettes)"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(doc)}
                    className="p-2 h-[38px] w-[38px] rounded-DEFAULT bg-surface-container-lowest border-2 border-rose-200 text-rose-600 hover:bg-rose-50 transition-all flex items-center justify-center cursor-pointer"
                    title="Supprimer"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination au scroll / chargement progressif des documents (Annotation 7) */}
      {visibleDocCount < filteredDocuments.length && (
        <div ref={loadMoreDocsRef} className="mt-8 flex flex-col items-center justify-center p-4">
          <button
            type="button"
            id="btn-load-more-docs"
            onClick={() => setVisibleDocCount((prev) => Math.min(prev + 20, filteredDocuments.length))}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary hover:bg-sage-soft font-label-md text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">expand_more</span>
            <span>Charger les 20 documents suivants ({displayedDocuments.length} affichés sur {filteredDocuments.length})</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1 : TÉLÉVERSER UN DOCUMENT CANONIQUE (UploadDocumentModal unifié)     */}
      {/* ========================================================================= */}
      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
        currentUser={currentUser}
        mode={uploadModalMode}
        defaultCategory={uploadModalMode === 'invoice' ? 'Travaux & Factures' : undefined}
      />

      {/* ========================================================================= */}
      {/* MODAL ÉDITION DE CATÉGORIE (#modal-edit-category) (Annotation 10)         */}
      {/* ========================================================================= */}
      {isEditCategoryModalOpen && selectedEditingCat && (
        <div id="modal-edit-category" className="fixed inset-0 z-[70] bg-inverse-surface/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl p-space-lg shadow-[0_20px_48px_-12px_rgba(15,23,42,0.25)] border border-border-subtle relative max-h-[90vh] overflow-y-auto animate-in fade-in duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-space-sm border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">tune</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-bold">
                    Éditer la catégorie
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    Modifier les paramètres ou supprimer la catégorie « {selectedEditingCat.name} »
                  </p>
                </div>
              </div>
              <button
                id="btn-close-edit-category"
                type="button"
                onClick={() => setIsEditCategoryModalOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form id="edit-category-form" onSubmit={handleUpdateCategorySubmit} className="mt-space-md flex flex-col gap-4">
              
              {/* Nom de la catégorie */}
              <div>
                <label htmlFor="edit-cat-name" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                  Nom de la catégorie *
                </label>
                <input
                  id="edit-cat-name"
                  type="text"
                  required
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  placeholder="Ex : Assurance Habitation"
                  className="w-full h-[48px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                />
              </div>

              {/* Émoji / Icône */}
              <div>
                <label htmlFor="edit-cat-emoji" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                  Émoji / Icône représentatif
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="edit-cat-emoji"
                    type="text"
                    value={editCatEmoji}
                    onChange={(e) => setEditCatEmoji(e.target.value)}
                    maxLength={3}
                    className="w-14 h-[48px] text-center text-xl bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-on-surface focus:outline-none focus:border-primary transition-all"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap flex-1 p-2 bg-surface-container-low rounded-DEFAULT border border-border-subtle">
                    {EMOJI_PRESETS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setEditCatEmoji(em)}
                        className={`w-8 h-8 text-base rounded hover:bg-white flex items-center justify-center transition-all cursor-pointer ${
                          editCatEmoji === em ? 'ring-2 ring-primary bg-white shadow-xs' : ''
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Couleur associée */}
              <div>
                <label className="block font-label-md text-xs font-bold text-on-surface mb-1.5">
                  Couleur associée
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEditCatColor(c.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-DEFAULT text-xs font-medium border cursor-pointer transition-all ${
                        editCatColor === c.id
                          ? 'ring-2 ring-primary ring-offset-1 font-bold shadow-xs'
                          : 'opacity-80 hover:opacity-100'
                      } ${c.badgeBg}`}
                    >
                      <span className={`w-3 h-3 rounded-full ${c.bg}`}></span>
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions de la modale */}
              <div className="mt-3 pt-space-sm border-t border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Bouton rouge sobre Supprimer */}
                <button
                  type="button"
                  id="btn-delete-category"
                  onClick={handleDeleteCategory}
                  disabled={isDeletingCat || isUpdatingCat}
                  className="h-[44px] px-4 rounded-DEFAULT bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 border border-rose-200 font-label-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  <span>{isDeletingCat ? 'Suppression...' : 'Supprimer cette catégorie'}</span>
                </button>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditCategoryModalOpen(false)}
                    className="h-[44px] px-4 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-md text-xs hover:bg-canvas-slate transition-all cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingCat || isDeletingCat || !editCatName.trim()}
                    className="h-[44px] px-5 rounded-DEFAULT bg-primary text-white font-label-md text-xs font-bold hover:bg-forest-deep transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isUpdatingCat ? 'sync' : 'save'}
                    </span>
                    <span>{isUpdatingCat ? 'Enregistrement...' : 'Enregistrer les modifications'}</span>
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2 : DÉCLARER UNE DÉPENSE POUR LA SCI (#modal-operation)             */}
      {/* ========================================================================= */}
      {isOperationModalOpen && (
        <div id="modal-operation" className="fixed inset-0 z-50 bg-inverse-surface/45 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-surface-container-lowest w-full max-w-xl rounded-2xl shadow-[0_20px_48px_-12px_rgba(15,23,42,0.20)] border border-border-subtle relative flex flex-col max-h-[92vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                  <span className="material-symbols-outlined text-[22px]">receipt_long</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-forest-deep font-semibold">
                    Déclarer une dépense pour la SCI
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    Dépense déductible des prochaines factures
                  </p>
                </div>
              </div>
              <button
                id="btn-close-operation"
                type="button"
                onClick={() => {
                  setIsOperationModalOpen(false);
                  setOperationFileError('');
                  setOperationLabelError('');
                }}
                className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form id="operation-form" onSubmit={handleOperationSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="overflow-y-auto p-4 sm:p-5 space-y-4 flex-1">
              
              {/* Callout Déductibilité — Sortie Exclusive (Annotation 5) */}
              <div
                id="callout-deductibilite"
                className="p-3.5 rounded-DEFAULT bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 flex items-start gap-3 shadow-xs"
              >
                <span className="material-symbols-outlined text-[20px] text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5">
                  savings
                </span>
                <p className="font-body-md text-xs sm:text-sm font-medium leading-relaxed">
                  Toutes dépenses effectuées pour la SCI et déclarées ici seront réduites de vos prochaines factures.
                </p>
              </div>

              {/* Montant & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                <div>
                  <label htmlFor="op-amount-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                    Montant de la dépense (€) <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="op-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={operationAmount}
                      onChange={(e) => setOperationAmount(e.target.value)}
                      className="w-full h-[52px] pl-4 pr-10 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-all tabular-nums"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant">€</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="op-date-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                    Date de valeur / règlement
                  </label>
                  <input
                    id="op-date-input"
                    type="date"
                    value={operationDate}
                    onChange={(e) => setOperationDate(e.target.value)}
                    className="w-full h-[52px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Justification de paiement — obligatoire (Annotation 6) */}
              <div>
                <label htmlFor="op-label-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                  Justification de paiement (obligatoire)
                </label>
                <input
                  id="op-label-input"
                  type="text"
                  required
                  placeholder="Ex : Achat quincaillerie, réparation toiture, fournitures..."
                  value={operationLabel}
                  onChange={(e) => {
                    setOperationLabel(e.target.value);
                    if (operationLabelError) setOperationLabelError('');
                  }}
                  className={`w-full h-[52px] px-4 bg-surface-container-lowest border-2 ${
                    operationLabelError ? 'border-error' : 'border-border-subtle'
                  } rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-all`}
                />
                {operationLabelError && (
                  <p className="mt-1.5 text-xs text-error font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    <span>{operationLabelError}</span>
                  </p>
                )}
              </div>

              {/* Justificatif / facture — obligatoire (Annotation 16 : Mécanique DRY deux boutons) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="block font-label-md text-label-md text-on-surface font-semibold">
                    Justificatif / facture (obligatoire) <span className="text-error">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      id="btn-op-upload-doc"
                      type="button"
                      onClick={() => setIsOpUploadModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-primary text-white font-label-md text-xs font-semibold hover:bg-forest-deep shadow-2xs transition-colors cursor-pointer"
                      title="Téléverser et archiver un nouveau justificatif officiel"
                    >
                      <span className="material-symbols-outlined text-[16px]">upload_file</span>
                      <span>Parcourir un document</span>
                    </button>
                    <button
                      id="btn-op-select-existing-doc"
                      type="button"
                      onClick={() => setIsOpSelectExistingModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-surface-container-lowest border border-border-subtle hover:border-primary text-on-surface font-label-md text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                      title="Sélectionner un document déjà répertorié dans la SCI"
                    >
                      <span className="material-symbols-outlined text-[16px]">library_books</span>
                      <span>Choisir un document existant</span>
                    </button>
                  </div>
                </div>

                {/* État du document sélectionné */}
                {operationDocument || operationFileName ? (
                  <div
                    id="op-selected-doc-card"
                    className="flex items-center justify-between p-3 bg-surface-container-low dark:bg-slate-800/80 rounded-lg border border-border-subtle text-xs animate-in fade-in duration-150"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">
                          {(operationFileName || '').toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-on-surface truncate" title={operationFileName}>
                          {operationFileName}
                        </p>
                        <p className="text-[11px] text-on-surface-variant flex items-center gap-2">
                          <span>
                            {operationDocument?.id ? `Document SCI #${operationDocument.id}` : 'Fichier sélectionné'}
                          </span>
                          {operationDocument?.category && (
                            <span className="px-1.5 py-0.5 rounded bg-surface-container text-[10px]">
                              {operationDocument.category}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      id="btn-op-detach-doc"
                      type="button"
                      onClick={handleDetachOperationDoc}
                      className="w-7 h-7 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-error flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-2"
                      title="Retirer ce justificatif"
                      aria-label="Retirer ce justificatif"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ) : (
                  <div
                    id="op-no-doc-placeholder"
                    className={`p-4 rounded-lg border border-dashed text-center text-xs transition-colors ${
                      operationFileError
                        ? 'border-error bg-rose-50/50 dark:bg-rose-950/20 text-error'
                        : 'border-border-subtle bg-surface-container-low/40 text-on-surface-variant'
                    }`}
                  >
                    <span>
                      Aucun justificatif sélectionné. Cliquez sur « <strong>Parcourir un document</strong> » pour téléverser un fichier ou sur « <strong>Choisir un document existant</strong> » pour associer un document déjà présent dans la SCI.
                    </span>
                  </div>
                )}

                {/* Avertissement rouge/ambre si aucun justificatif joint */}
                {operationFileError && (
                  <div
                    id="op-file-error-alert"
                    className="mt-2 p-2.5 rounded-DEFAULT bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-200"
                  >
                    <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 shrink-0">
                      warning
                    </span>
                    <span>{operationFileError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions - Pied FIXE toujours visible sur mobile */}
            <div className="p-3 sm:p-4 border-t border-border-subtle shrink-0 flex items-center justify-end gap-3 bg-surface-container-lowest">
              <button
                id="btn-cancel-operation"
                type="button"
                onClick={() => {
                  setIsOperationModalOpen(false);
                  setOperationFileError('');
                  setOperationLabelError('');
                }}
                className="h-[44px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-lg text-sm hover:bg-canvas-slate transition-all cursor-pointer"
              >
                Annuler
              </button>
              <button
                id="btn-submit-operation"
                type="submit"
                disabled={isSubmittingOperation}
                className="h-[44px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-lg text-sm font-bold hover:bg-sage-soft transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isSubmittingOperation ? 'progress_activity' : 'save'}
                </span>
                <span>{isSubmittingOperation ? 'Enregistrement...' : 'Enregistrer la dépense'}</span>
              </button>
            </div>

          </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3 : ÉDITER LE DOCUMENT (TITRE ET ÉTIQUETTES / TAGS) (#modal-rename) */}
      {/* ========================================================================= */}
      {isRenameModalOpen && selectedRenamingDoc && (
        <div id="modal-rename" className="fixed inset-0 z-50 bg-inverse-surface/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl p-space-lg shadow-[0_20px_48px_-12px_rgba(15,23,42,0.25)] border border-border-subtle relative max-h-[90vh] overflow-y-auto animate-in fade-in duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-space-sm border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">edit</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-bold">
                    Éditer le document
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    Modifier le titre ou ajuster les étiquettes et badges associés
                  </p>
                </div>
              </div>
              <button
                id="btn-close-rename"
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form id="rename-form" onSubmit={handleRenameSubmit} className="mt-space-md flex flex-col gap-4">
              <div>
                <label htmlFor="rename-input" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                  1. Nom de fichier / Titre du document *
                </label>
                <input
                  id="rename-input"
                  type="text"
                  required
                  value={renameInputValue}
                  onChange={(e) => setRenameInputValue(e.target.value)}
                  className="w-full h-[48px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                  placeholder="Ex : Facture EDF 022025"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="rename-tags-select" className="block font-label-md text-xs font-bold text-on-surface">
                    2. Étiquettes &amp; Badges associés (Multi-Tags)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenEditCategoryModal();
                    }}
                    className="text-xs text-primary hover:text-forest-deep font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">palette</span>
                    <span>Gérer les étiquettes</span>
                  </button>
                </div>

                <TagMultiSelect
                  id="rename-tags-select"
                  selectedTags={renameDocTags}
                  onChange={(newTags) => setRenameDocTags(newTags)}
                  availableCategories={categoriesList}
                  onOpenCreateCategory={() => handleOpenEditCategoryModal()}
                  onOpenEditCategory={(catName) => handleOpenEditCategoryModal(catName)}
                  placeholder="Ajouter des étiquettes au document..."
                />
              </div>

              <div className="mt-space-sm pt-space-sm border-t border-border-subtle flex items-center justify-end gap-space-sm">
                <button
                  id="btn-cancel-rename"
                  type="button"
                  onClick={() => setIsRenameModalOpen(false)}
                  className="h-[48px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-lg text-sm hover:bg-canvas-slate transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  id="btn-submit-rename"
                  type="submit"
                  className="h-[48px] px-6 rounded-DEFAULT bg-primary text-white font-label-lg text-sm font-bold hover:bg-forest-deep transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <span className="material-symbols-outlined text-[20px]">check</span>
                  <span>Enregistrer les modifications</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* MODAL 4B : UPLOAD DOCUMENT JUSTIFICATIF OPÉRATION (Annotation 16 DRY)     */}
      {/* ========================================================================= */}
      <UploadDocumentModal
        isOpen={isOpUploadModalOpen}
        onClose={() => setIsOpUploadModalOpen(false)}
        defaultCategory="Travaux & Factures"
        currentUser={currentUser}
        onUploadSuccess={handleOpUploadSuccess}
      />

      {/* ========================================================================= */}
      {/* MODAL 4C : SÉLECTION DOCUMENT EXISTANT OPÉRATION (Annotation 16 DRY)      */}
      {/* ========================================================================= */}
      <SelectExistingDocumentModal
        isOpen={isOpSelectExistingModalOpen}
        onClose={() => setIsOpSelectExistingModalOpen(false)}
        alreadyAttachedDocIds={operationDocument ? [operationDocument.id] : []}
        onAttachSuccess={handleOpSelectExistingSuccess}
      />

      {/* ========================================================================= */}
      {/* MODAL 5 : GRAND LIVRE FINANCIER & CCA                                     */}
      {/* ========================================================================= */}
      <FinancialLedgerModal
        isOpen={isFinancialModalOpen}
        onClose={() => setIsFinancialModalOpen(false)}
        initialTab={financialModalTab}
      />

      {/* ========================================================================= */}
      {/* MODAL 6 : VISIONNEUSE UNIVERSELLE INTÉGRÉE (Annotation 9)                */}
      {/* ========================================================================= */}
      <DocumentViewerModal
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setViewerDoc(null);
        }}
        document={viewerDoc}
        onDownload={handleDownload}
      />

      {/* ========================================================================= */}
      {/* TOAST FEEDBACK NOTIFICATION (Notifications positives / succès exclusif)   */}
      {/* ========================================================================= */}
      {toast.visible && toast.icon !== 'error' && (
        <div
          id="toast-feedback"
          role="status"
          className="fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-2xl border flex items-center gap-3 transition-all duration-300 max-w-md md:max-w-lg bg-forest-deep text-on-primary border-sage-border shadow-forest-deep/30 translate-y-0 opacity-100 pointer-events-auto"
        >
          <span
            id="toast-icon"
            className="material-symbols-outlined text-[24px] shrink-0 text-secondary-fixed"
          >
            {toast.icon}
          </span>
          <div className="flex flex-col flex-1 min-w-0 pr-1">
            <span id="toast-title" className="font-label-md text-label-md font-bold leading-tight">
              {toast.title}
            </span>
            <span id="toast-desc" className="font-body-md text-xs opacity-90 break-words mt-0.5 select-text font-mono">
              {toast.desc}
            </span>
          </div>
          <button
            id="btn-close-toast"
            type="button"
            onClick={() => setToast((prev) => ({ ...prev, visible: false }))}
            className="shrink-0 p-1.5 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors text-white/80 hover:text-white cursor-pointer ml-1"
            title="Fermer"
            aria-label="Fermer la notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
}
