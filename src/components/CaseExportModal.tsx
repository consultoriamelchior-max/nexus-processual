import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Copy, Check, FileDown } from "lucide-react";
import { toast } from "sonner";
import type { Case, Document, Conversation, Message, AiOutput } from "@/lib/types";

interface Props {
  caseData: Case;
  documents: Document[];
  conversations: Conversation[];
  messages: Message[];
  aiOutputs: AiOutput[];
}

function toTitleCase(str: string) {
  return str.toLowerCase().replace(/(?:^|\s|[-/])\S/g, (c) => c.toUpperCase());
}

function buildExportText(caseData: Case, documents: Document[], conversations: Conversation[], messages: Message[], aiOutputs: AiOutput[]): string {
  const client = (caseData as any).clients;
  const caseValue = (caseData as any).case_value;
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════");
  lines.push("         EXPORTAÇÃO DE CASO");
  lines.push("═══════════════════════════════════════");
  lines.push("");

  // Case info
  lines.push("📋 DADOS DO CASO");
  lines.push("───────────────────────────────────────");
  lines.push(`Título: ${caseData.case_title}`);
  if (caseData.process_number) lines.push(`Nº Processo: ${caseData.process_number}`);
  lines.push(`Status: ${caseData.status}`);
  if (caseData.case_type) lines.push(`Tipo: ${caseData.case_type}`);
  if (caseData.defendant) lines.push(`Réu: ${toTitleCase(caseData.defendant)}`);
  if (caseData.court) lines.push(`Tribunal/Comarca: ${caseData.court}`);
  if (caseData.distribution_date) lines.push(`Data de Distribuição: ${new Date(caseData.distribution_date).toLocaleDateString("pt-BR")}`);
  if (caseValue) lines.push(`Valor da Causa: R$ ${Number(caseValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  lines.push("");

  // Client info
  if (client) {
    lines.push("👤 DADOS DO CLIENTE");
    lines.push("───────────────────────────────────────");
    lines.push(`Nome: ${toTitleCase(client.full_name)}`);
    lines.push(`Telefone: ${client.phone}`);
    if (client.email) lines.push(`Email: ${client.email}`);
    if (client.cpf_or_identifier) lines.push(`CPF: ${client.cpf_or_identifier}`);
    if (client.notes) lines.push(`Observações: ${client.notes}`);
    lines.push("");
  }

  // Partner firm
  if (caseData.partner_law_firm_name || caseData.partner_lawyer_name) {
    lines.push("🏢 ESCRITÓRIO PARCEIRO");
    lines.push("───────────────────────────────────────");
    if (caseData.partner_law_firm_name) lines.push(`Escritório: ${caseData.partner_law_firm_name}`);
    if (caseData.partner_lawyer_name) lines.push(`Advogado: ${caseData.partner_lawyer_name}`);
    lines.push("");
  }

  // Documents
  if (documents.length > 0) {
    lines.push("📄 DOCUMENTOS");
    lines.push("───────────────────────────────────────");
    documents.forEach((d, i) => {
      lines.push(`${i + 1}. ${d.doc_type || "Documento"} — ${new Date(d.created_at).toLocaleDateString("pt-BR")}`);
      if (d.extracted_text) {
        lines.push(`   Texto extraído: ${d.extracted_text.substring(0, 200)}${d.extracted_text.length > 200 ? "..." : ""}`);
      }
    });
    lines.push("");
  }

  // AI Outputs
  const summary = aiOutputs.find((o) => o.output_type === "case_summary");
  if (summary) {
    lines.push("🤖 RESUMO DA IA");
    lines.push("───────────────────────────────────────");
    lines.push(summary.content);
    lines.push("");
  }

  // Messages
  if (messages.length > 0) {
    lines.push("💬 HISTÓRICO DE MENSAGENS");
    lines.push("───────────────────────────────────────");
    messages.forEach((m) => {
      const sender = m.sender === "client" ? "Cliente" : "Operador";
      const date = new Date(m.created_at).toLocaleString("pt-BR");
      lines.push(`[${date}] ${sender}: ${m.message_text}`);
    });
    lines.push("");
  }

  lines.push("───────────────────────────────────────");
  lines.push(`Exportado em: ${new Date().toLocaleString("pt-BR")}`);

  return lines.join("\n");
}

export function CaseExportModal({ caseData, documents, conversations, messages, aiOutputs }: Props) {
  const [copied, setCopied] = useState(false);
  const exportText = buildExportText(caseData, documents, conversations, messages, aiOutputs);

  const handleCopy = () => {
    navigator.clipboard.writeText(exportText);
    setCopied(true);
    toast.success("Conteúdo copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `caso-${caseData.case_title.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo .txt baixado!");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          <FileDown className="w-3.5 h-3.5 mr-1.5" /> Exportar Conteúdo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Exportar Conteúdo do Caso</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-3">
          <Button size="sm" variant="outline" onClick={handleCopy} className="text-xs">
            {copied ? <Check className="w-3.5 h-3.5 mr-1.5 text-primary" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            {copied ? "Copiado!" : "Copiar tudo"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} className="text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Baixar .txt
          </Button>
        </div>
        <pre className="flex-1 overflow-auto bg-secondary rounded-lg p-4 text-xs whitespace-pre-wrap font-mono text-foreground border border-border">
          {exportText}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
