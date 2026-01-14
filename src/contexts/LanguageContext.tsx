import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'id' | 'en';

interface Translations {
  [key: string]: {
    id: string;
    en: string;
  };
}

// All translations for the application
const translations: Translations = {
  // Navigation & Menu
  'nav.summary': { id: 'RINGKASAN', en: 'SUMMARY' },
  'nav.dashboard': { id: 'Dashboard', en: 'Dashboard' },
  'nav.transactions': { id: 'TRANSAKSI', en: 'TRANSACTIONS' },
  'nav.requests': { id: 'Pengajuan', en: 'Requests' },
  'nav.approvals': { id: 'Persetujuan', en: 'Approvals' },
  'nav.finance': { id: 'KEUANGAN', en: 'FINANCE' },
  'nav.paymentQueue': { id: 'Antrian Pembayaran', en: 'Payment Queue' },
  'nav.pettyCash': { id: 'Kas Kecil', en: 'Petty Cash' },
  'nav.bankPayments': { id: 'Pembayaran Bank', en: 'Bank Payments' },
  'nav.planning': { id: 'PERENCANAAN', en: 'PLANNING' },
  'nav.budgetPlanning': { id: 'Rencana Anggaran', en: 'Budget Planning' },
  'nav.budgetTransfer': { id: 'Transfer Anggaran', en: 'Budget Transfer' },
  'nav.masterData': { id: 'MASTER DATA', en: 'MASTER DATA' },
  'nav.divisions': { id: 'Divisi', en: 'Divisions' },
  'nav.categories': { id: 'Kategori Biaya', en: 'Cost Categories' },
  'nav.fundingSources': { id: 'Sumber Dana', en: 'Funding Sources' },
  'nav.users': { id: 'Pengguna', en: 'Users' },
  'nav.sessionManagement': { id: 'Manajemen Sesi', en: 'Session Management' },
  'nav.settings': { id: 'Pengaturan', en: 'Settings' },
  'nav.reports': { id: 'LAPORAN', en: 'REPORTS' },
  'nav.report': { id: 'Laporan', en: 'Reports' },
  'nav.auditLogs': { id: 'Audit Log', en: 'Audit Logs' },
  'nav.notifications': { id: 'Notifikasi', en: 'Notifications' },
  
  // Common Actions
  'action.logout': { id: 'Keluar', en: 'Logout' },
  'action.save': { id: 'Simpan', en: 'Save' },
  'action.cancel': { id: 'Batal', en: 'Cancel' },
  'action.submit': { id: 'Kirim', en: 'Submit' },
  'action.approve': { id: 'Setujui', en: 'Approve' },
  'action.reject': { id: 'Tolak', en: 'Reject' },
  'action.pay': { id: 'Bayar', en: 'Pay' },
  'action.edit': { id: 'Edit', en: 'Edit' },
  'action.delete': { id: 'Hapus', en: 'Delete' },
  'action.view': { id: 'Lihat', en: 'View' },
  'action.search': { id: 'Cari', en: 'Search' },
  'action.filter': { id: 'Filter', en: 'Filter' },
  'action.export': { id: 'Ekspor', en: 'Export' },
  'action.import': { id: 'Impor', en: 'Import' },
  'action.create': { id: 'Buat', en: 'Create' },
  'action.add': { id: 'Tambah', en: 'Add' },
  'action.topUp': { id: 'Top-up', en: 'Top-up' },
  'action.reconcile': { id: 'Rekonsiliasi', en: 'Reconcile' },
  'action.refresh': { id: 'Refresh', en: 'Refresh' },
  'action.back': { id: 'Kembali', en: 'Back' },
  'action.close': { id: 'Tutup', en: 'Close' },
  'action.confirm': { id: 'Konfirmasi', en: 'Confirm' },
  
  // Header
  'header.search': { id: 'Cari transaksi, request...', en: 'Search transactions, requests...' },
  'header.notifications': { id: 'Notifikasi', en: 'Notifications' },
  'header.profile': { id: 'Profil Saya', en: 'My Profile' },
  'header.viewAllNotifications': { id: 'Lihat semua notifikasi', en: 'View all notifications' },
  
  // User Menu
  'user.myProfile': { id: 'Profil Saya', en: 'My Profile' },
  'user.settings': { id: 'Pengaturan', en: 'Settings' },
  'user.logout': { id: 'Keluar', en: 'Logout' },
  'user.logoutSuccess': { id: 'Logout Berhasil', en: 'Logout Successful' },
  'user.logoutMessage': { id: 'Anda telah keluar dari sistem', en: 'You have been logged out' },
  
  // Roles
  'role.superAdmin': { id: 'Super Admin', en: 'Super Admin' },
  'role.finance': { id: 'Finance', en: 'Finance' },
  'role.admin': { id: 'Admin', en: 'Admin' },
  'role.user': { id: 'User', en: 'User' },
  
  // Status
  'status.draft': { id: 'Draft', en: 'Draft' },
  'status.submitted': { id: 'Diajukan', en: 'Submitted' },
  'status.underReview': { id: 'Dalam Review', en: 'Under Review' },
  'status.approved': { id: 'Disetujui', en: 'Approved' },
  'status.rejected': { id: 'Ditolak', en: 'Rejected' },
  'status.paid': { id: 'Dibayar', en: 'Paid' },
  'status.settled': { id: 'Selesai', en: 'Settled' },
  'status.cancelled': { id: 'Dibatalkan', en: 'Cancelled' },
  
  // Dashboard
  'dashboard.title': { id: 'Dashboard', en: 'Dashboard' },
  'dashboard.totalBudget': { id: 'Total Anggaran', en: 'Total Budget' },
  'dashboard.remainingBudget': { id: 'Sisa Anggaran', en: 'Remaining Budget' },
  'dashboard.actualPaid': { id: 'Total Dibayar', en: 'Total Paid' },
  'dashboard.pendingApprovals': { id: 'Menunggu Persetujuan', en: 'Pending Approvals' },
  'dashboard.pendingPayments': { id: 'Menunggu Pembayaran', en: 'Pending Payments' },
  'dashboard.overdueApprovals': { id: 'Persetujuan Terlambat', en: 'Overdue Approvals' },
  'dashboard.overduePayments': { id: 'Pembayaran Terlambat', en: 'Overdue Payments' },
  'dashboard.recentActivity': { id: 'Aktivitas Terkini', en: 'Recent Activity' },
  'dashboard.spendByCategory': { id: 'Pengeluaran per Kategori', en: 'Spend by Category' },
  'dashboard.budgetVsUsed': { id: 'Anggaran vs Terpakai', en: 'Budget vs Used' },
  
  // Requests
  'requests.title': { id: 'Pengajuan', en: 'Requests' },
  'requests.new': { id: 'Buat Pengajuan', en: 'New Request' },
  'requests.description': { id: 'Kelola pengajuan expense Anda', en: 'Manage your expense requests' },
  'requests.noData': { id: 'Belum ada pengajuan', en: 'No requests yet' },
  
  // Petty Cash
  'pettyCash.title': { id: 'Kas Kecil', en: 'Petty Cash' },
  'pettyCash.description': { id: 'Kelola saldo kas kecil, transaksi, dan rekonsiliasi', en: 'Manage petty cash balance, transactions, and reconciliation' },
  'pettyCash.totalBalance': { id: 'Total Saldo Kas Kecil', en: 'Total Petty Cash Balance' },
  'pettyCash.todayIn': { id: 'Masuk Hari Ini', en: 'Today In' },
  'pettyCash.todayOut': { id: 'Keluar Hari Ini', en: 'Today Out' },
  'pettyCash.transactions': { id: 'Transaksi', en: 'Transactions' },
  'pettyCash.reconciliation': { id: 'Rekonsiliasi', en: 'Reconciliation' },
  'pettyCash.noTransactions': { id: 'Belum ada transaksi', en: 'No transactions yet' },
  
  // Common
  'common.loading': { id: 'Memuat...', en: 'Loading...' },
  'common.noData': { id: 'Tidak ada data', en: 'No data' },
  'common.error': { id: 'Terjadi kesalahan', en: 'An error occurred' },
  'common.success': { id: 'Berhasil', en: 'Success' },
  'common.showing': { id: 'Menampilkan', en: 'Showing' },
  'common.of': { id: 'dari', en: 'of' },
  'common.data': { id: 'data', en: 'items' },
  'common.previous': { id: 'Sebelumnya', en: 'Previous' },
  'common.next': { id: 'Selanjutnya', en: 'Next' },
  'common.all': { id: 'Semua', en: 'All' },
  'common.today': { id: 'Hari Ini', en: 'Today' },
  'common.yesterday': { id: 'Kemarin', en: 'Yesterday' },
  'common.thisWeek': { id: 'Minggu Ini', en: 'This Week' },
  'common.thisMonth': { id: 'Bulan Ini', en: 'This Month' },
  'common.thisYear': { id: 'Tahun Ini', en: 'This Year' },
  'common.expandSidebar': { id: 'Perluas Sidebar', en: 'Expand Sidebar' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language');
    return (saved as Language) || 'id';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app-language', lang);
  };

  const t = (key: string): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }
    return translation[language];
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
