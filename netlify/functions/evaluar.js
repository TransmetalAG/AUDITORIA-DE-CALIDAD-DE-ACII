import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    };
  }

  try {
    const { registros } = JSON.parse(event.body);

    // Limitar a 50 reportes por vez para evitar timeout
    const reportes = registros.slice(0, 50).map((r, i) => ({
      id: i,
      descripcion: (r.descripcion || "").substring(0, 500),
      accion: (r.accion || "").substring(0, 500),
    }));

    // 🔥 PROMPT CORTO Y EFECTIVO
    const prompt = `
Eres auditor SISO. Devuelve SOLO JSON array.

REGLAS:
- relacionada=30 si hay riesgo (grasa, cable, fuga, guarda, lentes, hongo, esmeril+oxicorte)
- grupo=10 si afecta personas
- corrige=60 si la acción YA SE HIZO (verbo pasado: se reparó, se cambió, se limpió, se movió, se apagó, se detuvo)
- informa=25 si solo reporta
- NUNCA corrige e informa juntos

EJEMPLOS:
1. Grasa en suelo + "Se reporta" → {"relacionada":30,"grupo":10,"corrige":0,"informa":25}
2. Cable suelto + "Se repara" → {"relacionada":30,"grupo":10,"corrige":60,"informa":0}
3. Falta guarda + "" → {"relacionada":30,"grupo":10,"corrige":0,"informa":0}
4. Esmeril+oxicorte + "Separar equipos" → {"relacionada":30,"grupo":10,"corrige":0,"informa":0}
5. Esmeril+oxicorte + "Se separaron" → {"relacionada":30,"grupo":10,"corrige":60,"informa":0}
6. Dispensador agua + "Se reporta" → {"relacionada":0,"grupo":0,"corrige":0,"informa":25}
7. Sin lentes + "" → {"relacionada":30,"grupo":10,"corrige":0,"informa":0}
8. Sin lentes + "Se los colocó" → {"relacionada":30,"grupo":10,"corrige":60,"informa":0}

Reportes:
${JSON.stringify(reportes, null, 2)}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Responde solo JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0,
      max_tokens: 2000,
    });

    let contenido = completion.choices[0].message.content
      .replace(/```json|```/g, "")
      .trim();

    let evaluaciones = [];

    try {
      evaluaciones = JSON.parse(contenido);
    } catch {
      const match = contenido.match(/\[[\s\S]*\]/);
      if (match) evaluaciones = JSON.parse(match[0]);
    }

    if (!Array.isArray(evaluaciones)) {
      evaluaciones = registros.map(() => ({
        relacionada: 0,
        grupo: 0,
        corrige: 0,
        informa: 0
      }));
    }

    // 🔥 PALABRAS CLAVE SIMPLIFICADAS
    const palabrasRiesgo = [
      "grasa", "suelo", "piso", "cable", "fuga", "electr", "canaleta",
      "guardia", "energia", "lentes", "botas", "desorden", "cristal", 
      "hongo", "troquel", "esmeril", "oxicorte", "derrame", "caida"
    ];
    
    const palabrasEjecutado = [
      "se reparo", "se reparó", "se cambio", "se cambió", "se limpio", "se limpió",
      "se ordeno", "se ordenó", "se movio", "se movió", "se separaron", "se apago",
      "se apagó", "se hizo", "se iso", "se detuvo", "se coloco", "se colocó"
    ];
    
    const palabrasIntencion = [
      "programar", "planificar", "agendar", "separar", "mover", "limpiar", "ordenar"
    ];
    
    const palabrasInforma = ["report", "inform", "avis", "notific", "comunic"];

    const resultados = registros.map((r, i) => {
      let ev = evaluaciones[i] || {};
      
      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;
      
      const texto = (r.descripcion || "").toLowerCase();
      const accion = (r.accion || "").toLowerCase();
      
      // Emergencia: si IA no detectó nada
      if (relacionada === 0 && grupo === 0 && corrige === 0 && informa === 0) {
        
        if (palabrasRiesgo.some(p => texto.includes(p))) {
          relacionada = 30;
          grupo = 10;
        }
        
        const yaEjecutado = palabrasEjecutado.some(p => accion.includes(p));
        const esIntencion = palabrasIntencion.some(p => accion.includes(p));
        
        if (yaEjecutado && !esIntencion) {
          corrige = 60;
          informa = 0;
        } else if (palabrasInforma.some(p => accion.includes(p))) {
          informa = 25;
        }
      }
      
      // Consistencia
      if (relacionada === 30 && grupo === 0) grupo = 10;
      if (corrige === 60) informa = 0;
      
      // Validación final para intenciones
      const accionLower = (r.accion || "").toLowerCase();
      const esIntencionFinal = palabrasIntencion.some(p => accionLower.includes(p));
      const noEjecutado = !palabrasEjecutado.some(p => accionLower.includes(p));
      
      if (esIntencionFinal && noEjecutado && corrige === 60) {
        corrige = 0;
      }
      
      const total = relacionada + grupo + corrige + informa;
      
      return {
        "No. ACII": r.numero || "",
        "Descripción": r.descripcion || "",
        "Acción Inmediata": r.accion || "",
        "Relacionada SISO (30)": relacionada,
        "Grupo específico (10)": grupo,
        "Corrige (60)": corrige,
        "Informa (25)": informa,
        "Total": total,
        "Área": r.area || ""
      };
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resultados),
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
