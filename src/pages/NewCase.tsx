import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Upload, Loader2, Sparkles, User, FileText } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/lib/types";

export default function NewCase() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [processingPdf, setProcessingPdf] = useState(false);

  // Client
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [newClient, setNewClient] = useState({ full_name: "", phone: "", email: "", cpf_or_identifier: "" });
  const [clientMode, setClientMode] = useState<"select" | "new">("new");

  // Case
  const [caseData, setCaseData] = useState({
    case_title: "",
    defendant: "",
    case_type: "",
    court: "",
    process_number: "",
    distribution_date: "",
    partner_law_firm_name: "",
    partner_lawyer_name: "",
  });

  // PDF
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  useEffect(() => {
    if (user) {
      supabase.from("clients").select("*").order("full_name").then(({ data }) => {
        setClients((data as Client[]) ?? []);
      });
    }
  }, [user]);

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Create or use existing client
      let clientId = selectedClientId;
      if (clientMode === "new") {
        if (!newClient.full_name.trim() || !newClient.phone.trim()) {
          toast.error("Nome e telefone são obrigatórios.");
          setLoading(false);
          return;
        }
        const { data: cData, error: cErr } = await supabase
          .from("clients")
          .insert({ ...newClient, user_id: user.id })
          .select()
          .single();
        if (cErr) throw cErr;
        clientId = cData.id;
      }

      if (!clientId) {
        toast.error("Selecione ou crie um cliente.");
        setLoading(false);
        return;
      }

      if (!caseData.case_title.trim()) {
        toast.error("Título do caso é obrigatório.");
        setLoading(false);
        return;
      }

      // 2. Create case
      const { data: caseResult, error: caseErr } = await supabase
        .from("cases")
        .insert({
          ...caseData,
          client_id: clientId,
          user_id: user.id,
          distribution_date: caseData.distribution_date || null,
        })
        .select()
        .single();
      if (caseErr) throw caseErr;

      // 3. Upload PDF if present
      if (pdfFile) {
        const filePath = `${user.id}/${caseResult.id}/${pdfFile.name}`;
        const { error: uploadErr } = await supabase.storage.from("documents").upload(filePath, pdfFile);
        if (uploadErr) throw uploadErr;

        await supabase.from("documents").insert({
          case_id: caseResult.id,
          user_id: user.id,
          doc_type: "petição inicial",
          file_url: filePath,
        });
      }

      // 4. Create initial conversation
      await supabase.from("conversations").insert({
        case_id: caseResult.id,
        user_id: user.id,
        channel: "WhatsApp",
      });

      toast.success("Caso criado com sucesso!");
      navigate(`/case/${caseResult.id}`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar caso.");
    }
    setLoading(false);
  };

  const handleProcessPdf = async () => {
    if (!pdfFile) return;
    toast.info("O PDF será processado após a criação do caso.");
  };

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <h1 className="text-2xl font-bold mb-1">Novo Caso</h1>
        <p className="text-sm text-muted-foreground mb-6">Preencha os dados do cliente e do caso.</p>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step >= s ? "bg-gradient-gold text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}>
                {s === 1 ? <User className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              </div>
              <span className={`text-xs font-medium ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
                {s === 1 ? "Cliente" : "Caso & Documento"}
              </span>
              {s < 2 && <div className={`w-12 h-0.5 ${step > s ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-card animate-fade-in">
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex gap-2 mb-4">
                <Button
                  variant={clientMode === "new" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setClientMode("new")}
                  className={clientMode === "new" ? "bg-gradient-gold text-primary-foreground" : ""}
                >
                  Novo Cliente
                </Button>
                <Button
                  variant={clientMode === "select" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setClientMode("select")}
                  className={clientMode === "select" ? "bg-gradient-gold text-primary-foreground" : ""}
                  disabled={clients.length === 0}
                >
                  Selecionar Existente
                </Button>
              </div>

              {clientMode === "new" ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Nome completo *</Label>
                      <Input value={newClient.full_name} onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })} className="bg-secondary border-border" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Telefone *</Label>
                      <Input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} className="bg-secondary border-border" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">CPF / Identificador</Label>
                      <Input value={newClient.cpf_or_identifier} onChange={(e) => setNewClient({ ...newClient, cpf_or_identifier: e.target.value })} className="bg-secondary border-border" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">E-mail</Label>
                      <Input value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} className="bg-secondary border-border" />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Selecionar cliente</Label>
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Escolha um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name} — {c.phone}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button onClick={() => setStep(2)} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
                  Próximo <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Título do caso *</Label>
                <Input value={caseData.case_title} onChange={(e) => setCaseData({ ...caseData, case_title: e.target.value })} className="bg-secondary border-border" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Réu</Label>
                  <Input value={caseData.defendant} onChange={(e) => setCaseData({ ...caseData, defendant: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Tipo de ação</Label>
                  <Input value={caseData.case_type} onChange={(e) => setCaseData({ ...caseData, case_type: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Tribunal / Vara</Label>
                  <Input value={caseData.court} onChange={(e) => setCaseData({ ...caseData, court: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Nº do processo</Label>
                  <Input value={caseData.process_number} onChange={(e) => setCaseData({ ...caseData, process_number: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Data de distribuição</Label>
                  <Input type="date" value={caseData.distribution_date} onChange={(e) => setCaseData({ ...caseData, distribution_date: e.target.value })} className="bg-secondary border-border" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Escritório parceiro</Label>
                  <Input value={caseData.partner_law_firm_name} onChange={(e) => setCaseData({ ...caseData, partner_law_firm_name: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Advogado parceiro</Label>
                  <Input value={caseData.partner_lawyer_name} onChange={(e) => setCaseData({ ...caseData, partner_lawyer_name: e.target.value })} className="bg-secondary border-border" />
                </div>
              </div>

              {/* PDF Upload */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Upload da Petição (PDF)</Label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-secondary/50">
                  <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                  <span className="text-xs text-muted-foreground">{pdfFile ? pdfFile.name : "Clique para selecionar PDF"}</span>
                  <input type="file" accept=".pdf" className="hidden" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 gap-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                </Button>
                <Button onClick={handleSubmit} disabled={loading} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Criar Caso
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
