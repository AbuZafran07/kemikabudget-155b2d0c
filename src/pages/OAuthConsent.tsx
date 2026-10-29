import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { language } = useLanguage();
  const id = params.get('authorization_id') ?? '';
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const copy = (idText: string, enText: string) => language === 'id' ? idText : enText;
  const loginPath = '/?next=' + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);

  useEffect(() => {
    let active = true;
    setError('');
    setDetails(null);
    async function load() {
      try {
        if (!id) throw new Error(copy('Permintaan koneksi tidak valid atau sudah kedaluwarsa.', 'This connection request is invalid or expired.'));
        const { data: session, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionError) throw new Error(copy('Tidak dapat memeriksa akun. Silakan coba lagi.', 'Could not check your account. Please try again.'));
        if (!session.session) { navigate(loginPath, { replace: true }); return; }
        const { data, error: lookupError } = await supabase.auth.oauth.getAuthorizationDetails(id);
        if (!active) return;
        if (lookupError || !data) throw new Error(copy('Permintaan koneksi tidak tersedia. Mulai koneksi kembali dari aplikasi agen.', 'This connection request is unavailable. Start the connection again from your agent app.'));
        if ('redirect_url' in data) { window.location.assign(data.redirect_url); return; }
        setDetails(data);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : copy('Tidak dapat memuat permintaan koneksi.', 'Could not load the connection request.'));
      }
    }
    void load();
    return () => { active = false; };
  }, [id, retry, navigate, language]);

  async function decide(approve: boolean) {
    if (busy || !details) return;
    setBusy(true);
    setError('');
    try {
      const result = approve
        ? await supabase.auth.oauth.approveAuthorization(id)
        : await supabase.auth.oauth.denyAuthorization(id);
      if (result.error || !result.data?.redirect_url) throw new Error(copy('Keputusan belum tersimpan. Silakan coba lagi.', 'Your decision was not saved. Please try again.'));
      window.location.assign(result.data.redirect_url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : copy('Koneksi gagal. Silakan coba lagi.', 'Connection failed. Please try again.'));
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-background flex items-center justify-center p-6">
    <section className="w-full max-w-lg space-y-6">
      <ShieldCheck className="h-10 w-10 text-primary" />
      <h1 className="text-2xl font-semibold text-foreground">{details ? copy(`Hubungkan ${details.client.name} ke Budget Expense`, `Connect ${details.client.name} to Budget Expense`) : copy('Koneksi Budget Expense', 'Budget Expense connection')}</h1>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!details && !error && <Loader2 aria-label="Loading" className="h-6 w-6 animate-spin text-primary" />}
      {details && <>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{copy('Akun', 'Account')}: {details.user.email}</p>
          {details.client.uri && <p className="break-all">{copy('Situs aplikasi', 'Client website')}: {details.client.uri}</p>}
          <p>{copy('Agen dapat membaca ringkasan pengajuan dan anggaran sesuai izin akun Anda, tanpa menyetujui, membayar, atau menghapus data.', 'The agent can read request summaries and budgets within your account permissions, without approving, paying or deleting records.')}</p>
        </div>
        <ul className="space-y-2 text-sm text-foreground">
          {(details.scope ?? '').split(/\s+/).filter(Boolean).map(scope => <li key={scope}>{scope === 'email' ? copy('Bagikan alamat email', 'Share your email address') : scope === 'profile' ? copy('Bagikan profil dasar', 'Share your basic profile') : scope === 'openid' ? copy('Verifikasi identitas akun', 'Verify your account identity') : copy(`Izin tambahan: ${scope}`, `Additional permission: ${scope}`)}</li>)}
        </ul>
        <p className="text-sm text-muted-foreground">{copy('Izin akses aplikasi tetap berlaku. Data rekening dan klaim medis tidak dibagikan oleh alat ini.', 'App access permissions still apply. These tools do not share bank details or medical claims.')}</p>
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void decide(true)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{copy('Izinkan koneksi', 'Allow connection')}</Button>
          <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>{copy('Batalkan koneksi', 'Cancel connection')}</Button>
          <Button variant="ghost" disabled={busy} onClick={async () => { await signOut(); navigate(loginPath, { replace: true }); }}>{copy('Ganti akun', 'Switch account')}</Button>
        </div>
      </>}
      {!details && error && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>{copy('Coba lagi', 'Try again')}</Button>}
    </section>
  </main>;
}