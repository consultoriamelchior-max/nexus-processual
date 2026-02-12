import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { caseId, documentId, extractedText, fileUrl } = await req.json();

    let text = extractedText || "";

    // If no extracted text but we have fileUrl, we can't extract PDF text server-side easily
    // For now we'll work with whatever text is provided
    if (!text && fileUrl) {
      // Try to get the document's extracted_text from DB
      const { data: doc } = await supabase.from("documents").select("extracted_text").eq("id", documentId).single();
      text = doc?.extracted_text || "";
    }

    if (!text) {
      // Save a note that no text was available
      return new Response(JSON.stringify({ error: "Nenhum texto disponível para análise. Cole o texto do PDF manualmente ou use um leitor de PDF externo." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um assistente jurídico especializado em análise de petições e documentos processuais brasileiros.
Analise o texto fornecido e extraia as seguintes informações em formato JSON:
{
  "partes": {"autor": "...", "reu": "..."},
  "tipo_acao": "...",
  "tribunal": "...",
  "advogados": ["..."],
  "valores_citados": ["..."],
  "datas_encontradas": ["..."],
  "resumo": "Resumo em linguagem simples para leigos, máximo 3 parágrafos",
  "perguntas_provaveis_cliente": ["Lista de 3-5 perguntas que o cliente provavelmente fará"],
  "alertas_golpe": ["Lista de elementos que podem parecer suspeitos para o cliente ao ser contactado sobre este processo"]
}
Responda APENAS com o JSON válido, sem markdown.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analise este documento processual:\n\n${text.slice(0, 15000)}` },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse the JSON from AI response
    let extractedJson: any = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedJson = JSON.parse(jsonMatch[0]);
      }
    } catch {
      extractedJson = { resumo: content };
    }

    // Update document with extracted data
    if (documentId) {
      await supabase.from("documents").update({
        extracted_text: text,
        extracted_json: extractedJson,
      }).eq("id", documentId);
    }

    // Save AI summary output
    const userFromAuth = authHeader ? await supabase.auth.getUser(authHeader.replace("Bearer ", "")) : null;
    const userId = userFromAuth?.data?.user?.id;

    if (userId && caseId) {
      await supabase.from("ai_outputs").insert({
        case_id: caseId,
        user_id: userId,
        output_type: "case_summary",
        content: extractedJson.resumo || content,
        confidence_score: 7,
        scam_risk: extractedJson.alertas_golpe?.length > 2 ? "alto" : extractedJson.alertas_golpe?.length > 0 ? "médio" : "baixo",
        rationale: (extractedJson.alertas_golpe || []).join("; "),
      });
    }

    return new Response(JSON.stringify({ success: true, extracted: extractedJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
