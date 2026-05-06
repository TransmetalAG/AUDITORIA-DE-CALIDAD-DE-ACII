import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔥 Función de normalización (solo para reglas de emergencia)
const normalizarTexto = (str) => {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

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

    const reportes = registros.map((r, i) => ({
      id: i,
      descripcion: r.descripcion || "",
      accion: r.accion || "",
    }));

    // 🔥 PROMPT CON EJEMPLOS (FEW-SHOT)
    const prompt = `
Eres un auditor SISO experto en seguridad industrial.

Debes evaluar cada reporte y devolver SOLO un array JSON.

REGLAS ESTRICTAS:
- relacionada = 30 si el reporte describe una condición insegura o acto inseguro (riesgo de accidente).
- grupo = 10 si la condición afecta a personas o a un área específica de trabajo.
- corrige = 60 si la acción inmediata SOLUCIONA el problema (reparar, instalar, cambiar, detener, limpiar).
- informa = 25 si la acción inmediata solo COMUNICA el problema (reportar, avisar, notificar).
- NUNCA poner corrige e informa juntos. Si corrige=60, informa=0.

EJEMPLOS:

1. Descripción: "Cable eléctrico suelto en pasillo"
   Acción: "Se repara el cable"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}

2. Descripción: "Grasa en el suelo del área de producción"
   Acción: "Se reporta a supervisor"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

3. Descripción: "Ruido extraño en motor"
   Acción: "Se detiene máquina y se reporta"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}

4. Descripción: "Falta de iluminación en bodega"
   Acción: "Se informa a mantenimiento"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

5. Descripción: "Temperatura normal en área de trabajo"
   Acción: "Ninguna"
   Salida: {"relacionada": 0, "grupo": 0, "corrige": 0, "informa": 0}

6. Descripción: "Faja quebrada en troqueladora"
   Acción: "Se reemplaza la faja"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}

7. Descripción: "Canaleta eléctrica caída"
   Acción: "Se reporta al soldador"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

8. Descripción: "Ventilador sobrecalentado"
   Acción: "Se apaga y se reporta"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}

Ahora evalúa estos reportes:

${JSON.stringify(reportes, null, 2)}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Eres un auditor SISO. Responde SOLO con el JSON, sin explicaciones." },
        { role: "user", content: prompt }
      ],
      temperature: 0,
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

    // 🔥 RED DE SEGURIDAD: PALABRAS CLAVE SOLO PARA CASOS QUE LA IA NO DETECTÓ
    // Esto NO sobrescribe, solo actúa cuando la IA devolvió TODO CEROS
    
    // Palabras de riesgo (amplias pero no sobrescriben)
    const palabrasRiesgoEmergencia = [
      "grasa", "suelo", "piso", "resbal", "caida", "cable", "fuga", 
      "aceite", "canaleta", "faja", "quebrada", "ventilador", "temperatura",
      "sobrecalienta", "chispa", "humo", "golpe", "atrap", "corte",
      "electr", "caliente", "manguera", "tuberia", "arnes", "altura"
    ];
    
    const palabrasCorrigeEmergencia = ["repar", "corrig", "instal", "cambi", "deten", "paro", "limpia", "reemplaz"];
    const palabrasInformaEmergencia = ["report", "inform", "avis", "comunic", "notific"];

    const resultados = registros.map((r, i) => {
      let ev = evaluaciones[i] || {};
      
      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;
      
      // 🔥 SOLO si la IA no detectó NADA (todo ceros), aplicar reglas de emergencia
      const iaNoDetectoNada = (relacionada === 0 && grupo === 0 && corrige === 0 && informa === 0);
      
      if (iaNoDetectoNada) {
        const texto = normalizarTexto(r.descripcion || "");
        const accion = normalizarTexto(r.accion || "");
        
        // Detectar riesgo por palabras clave (solo en emergencia)
        if (palabrasRiesgoEmergencia.some(p => texto.includes(p))) {
          relacionada = 30;
          grupo = 10;
        }
        
        // Detectar acción
        if (palabrasCorrigeEmergencia.some(p => accion.includes(p))) {
          corrige = 60;
          informa = 0;
        } else if (palabrasInformaEmergencia.some(p => accion.includes(p))) {
          informa = 25;
        }
      }
      
      // 🔥 Reglas de consistencia (aplican siempre)
      if (relacionada === 30 && grupo === 0) {
        grupo = 10;
      }
      
      if (corrige === 60 && informa !== 0) {
        informa = 0;
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
    console.error("❌ Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
