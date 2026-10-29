import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

export interface CaSuggestion {
  item_id: string | null;
  description: string;
  category_id: string;
  category_name: string;
  reason: string;
  remaining: number;
}

export function CaBudgetSuggestions({ divisionId, purpose, items, onApply }: {
  divisionId: string;
  purpose: string;
  items: { id: string; description: string }[];
  onApply: (suggestion: CaSuggestion) => void;
}) {
  const { language } = useLanguage();
  const english = language === "en";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<CaSuggestion[] | null>(null);
  const [applied, setApplied] = useState<number[]>([]);
  const current = useRef(0);
  const itemText = JSON.stringify(items);
  useEffect(() => {
    current.current += 1;
    setSuggestions(null);
    setApplied([]);
    setError("");
    setLoading(false);
  }, [divisionId, purpose, itemText]);
  async function suggest() {
    const request = ++current.current;
    setLoading(true);
    setError("");
    setSuggestions(null);
    try {
      const { data, error: failure } = await supabase.functions.invoke("suggest-ca-budget", {
        body: { division_id: divisionId, purpose, items, language },
      });
      if (failure) {
        let message = failure.message;
        if ("context" in failure && failure.context instanceof Response) {
          const detail = await failure.context.json().catch(() => null);
          message = detail?.error || message;
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      if (current.current === request) setSuggestions(data?.suggestions || []);
    } catch (failure) {
      if (current.current === request) setError(failure instanceof Error ? failure.message : "Lovable AI gagal");
    } finally {
      if (current.current === request) setLoading(false);
    }
  }
  return <div className="space-y-3">
    <Button variant="outline" size="sm" onClick={suggest} disabled={loading || !divisionId || purpose.trim().length < 3}>
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
      {english ? "Suggest budget posts with AI" : "Sarankan Pos dengan AI"}
    </Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {suggestions?.length === 0 && <p className="text-sm text-muted-foreground">{english ? "No suitable post suggested." : "Belum ada pos yang dapat disarankan."}</p>}
    {suggestions && suggestions.length > 0 && <div className="divide-y rounded-md border">
      {suggestions.map((s, index) => <div key={`${s.category_id}-${index}`} className="flex flex-wrap items-start justify-between gap-3 p-3">
        <div className="min-w-0 flex-1 space-y-1 break-words text-sm">
          <p className="font-medium">{s.description}</p>
          <p>{s.category_name}</p>
          <p className="text-muted-foreground">{s.reason}</p>
          <p className={s.remaining <= 0 ? "text-destructive" : "text-muted-foreground"}>
            {english ? "Available" : "Tersedia"}: {new Intl.NumberFormat("id-ID", {style: "currency", currency: "IDR", maximumFractionDigits: 0}).format(s.remaining)}
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={applied.includes(index)} onClick={() => {setApplied((previous) => [...previous, index]); onApply(s);}}>
          <Check className="mr-2 h-4 w-4" />{english ? "Apply" : "Terapkan"}
        </Button>
      </div>)}
    </div>}
  </div>;
}