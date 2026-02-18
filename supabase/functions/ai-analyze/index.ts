import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { petitionText, contractText, contractType, phoneProvided } = await req.json();

    if (!petitionText?.trim() && !contractText?.trim()) {
      return new Response(JSON.stringify({ error: "Nenhum texto disponível para análise." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOmni = contractType === "omni";

    const systemPrompt = `Você é um assistente jurídico especializado em análise de documentos brasileiros de financiamento (CCB) e petições iniciais.
    
TAREFA: Extraia dados estruturados combinando as informações da PETIÇÃO e do CONTRATO judicial.

DIRETRIZES DE EXTRAÇÃO DE TELEFONE (ALTA PRIORIDADE):
- O campo "phone_contract" é o seu objetivo principal. Ele deve conter o telefone de contato direto do CLIENTE.
- BUSCA EXAUSTIVA: Procure por rótulos como "Celular:", "Fone:", "Telefone:", "Tel:", "WhatsApp:", "Contato:".
- NO CONTRATO (CCB): Geralmente está no bloco de identificação do emitente/devedor, logo abaixo ou ao lado do e-mail e endereço.
- NA PETIÇÃO: Geralmente está no parágrafo de qualificação do autor no início do documento.
- MAPEAMENTO: Qualquer telefone do cliente encontrado nos documentos DEVE ser retornado no campo "phone_contract".
- CUIDADO: Ignore telefones claramente associados apenas a advogados (perto de OAB).

RESUMO EXECUTIVO:
- Resumo de 2 a 3 frases concisas.
- Deve identificar Autor, Réu, objetivo da ação e motivo principal.
- Evite detalhes técnicos desnecessários como CPFs e jurisprudência.

Responda APENAS com JSON válido:
{
  "client_name": "Nome",
  "client_cpf": "CPF",
  "defendant": "Réu",
  "case_type": "Ação",
  "court": "Vara",
  "process_number": "Processo",
  "distribution_date": "YYYY-MM-DD",
  "case_value": 0.00,
  "lawyers": [{"name": "...", "oab": "...", "role": "..."}],
  "partner_law_firm": "Escritório",
  "phone_contract": "Apenas dígitos do telefone encontrado",
  "summary": "Resumo equilibrado"
}`;

    // Truncate texts to avoid token limits
    const pText = (petitionText || "").slice(0, 10000);
    const cText = (contractText || "").slice(0, 5000);
    console.log("Sending text to AI, petition length:", pText.length, "contract length:", cText.length);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Telefone fornecido pelo operador: ${phoneProvided || "não informado"}\n\nTEXTO DA PETIÇÃO:\n${pText || "Não fornecido"}\n\nTEXTO DO CONTRATO/CCB:\n${cText || "Não fornecido"}` },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({
        error: `Erro no gateway de IA: ${response.status}`,
        details: errText
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";
    console.log("AI response length:", content.length, "First 200 chars:", content.slice(0, 200));

    let extracted: any = {};
    try {
      // Try to find JSON in the response, handling markdown code blocks
      let jsonStr = content;
      // Remove markdown code blocks if present
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        console.error("No JSON found in AI response:", content.slice(0, 500));
        extracted = { summary: content, client_name: "", defendant: "" };
      }
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, "Content:", content.slice(0, 500));
      extracted = { summary: content, client_name: "", defendant: "" };
    }

    return new Response(JSON.stringify({ success: true, extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
