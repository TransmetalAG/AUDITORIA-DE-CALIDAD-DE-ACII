exports.handler = async function (event) {
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
    if (!event.body) {
      throw new Error("No se recibieron datos");
    }

    const { registros } = JSON.parse(event.body);

    if (!registros || registros.length === 0) {
      throw new Error("No hay registros para evaluar");
    }

    console.log(`Procesando ${registros.length} registros`);

    const reportesParaIA = registros.map((r, idx) => ({
      id: idx,
      descripcion: r.descripcion,
      accion: r.accion,
    }));

    const prompt = `Eres un auditor SISO. Para CADA reporte, asigna puntajes SEGÚN ESTAS REGLAS:

REGLAS DE PUNTAJE:
- relacionada: 30 si está relacionada con SISO, 0 si no
- grupo: 10 si aplica a grupo específico, 0 si no  
- corrige: 60 si el trabajador DEBE corregir, 0 si no
- informa: 25 si solo DEBE informar, 0 si no

REGLAS OBLIGATORIAS:
- NUNCA asignar corrige=60 e informa=25 en el mismo reporte

RESPONDE ÚNICAMENTE con un array JSON.

FORMATO EXACTO:
[
  {
    "relacionada": 30,
    "grupo": 10,
    "corrige": 0,
    "informa": 25,
    "comentario": "Breve justificación"
  }
]

REPORTES:
${JSON.stringify(reportesParaIA, null, 2)}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Eres un auditor SISO. Siempre respondes SOLO con JSON válido."
          },
          {
            role: "user",
            content: prompt,
          }
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error OpenAI:", response.status, errorText);
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const contenido = data.choices?.[0]?.message?.content;

    if (!contenido) {
      throw new Error("OpenAI no devolvió contenido");
    }

    console.log("Respuesta OpenAI:", contenido);

    let evaluaciones = [];
    let cleanedContent = contenido.trim();
    
    if (cleanedContent.startsWith("```json")) {
      cleanedContent = cleanedContent.replace(/```json\n?/, "").replace(/\n?```$/, "");
    }
    if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent.replace(/```\n?/, "").replace(/\n?```$/, "");
    }

    try {
      const parsed = JSON.parse(cleanedContent);
      if (Array.isArray(parsed)) {
        evaluaciones = parsed;
      } else if (parsed.evaluaciones && Array.isArray(parsed.evaluaciones)) {
        evaluaciones = parsed.evaluaciones;
      } else {
        evaluaciones = [parsed];
      }
    } catch (e) {
      console.error("Error parseando JSON:", e);
      const jsonMatch = contenido.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        try {
          evaluaciones = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          evaluaciones = [];
        }
      }
    }

    if (evaluaciones.length === 0) {
      evaluaciones = registros.map(() => ({
        relacionada: 0,
        grupo: 0,
        corrige: 0,
        informa: 0,
        comentario: "Evaluación no disponible"
      }));
    }

    const resultados = registros.map((registro, index) => {
      const evaluacion = evaluaciones[index] || evaluaciones[0] || {};
      
      let relacionada = evaluacion.relacionada === 30 ? 30 : 0;
      let grupo = evaluacion.grupo === 10 ? 10 : 0;
      let corrige = evaluacion.corrige === 60 ? 60 : 0;
      let informa = evaluacion.informa === 25 ? 25 : 0;
      
      if (corrige === 60 && informa === 25) {
        informa = 0;
      }
      
      const total = relacionada + grupo + corrige + informa;
      
      return {
        "No. ACII": registro.numero || "",
        "Descripción": registro.descripcion || "",
        "Acción Inmediata": registro.accion || "",
        "Relacionada SISO (30)": relacionada,
        "Grupo específico (10)": grupo,
        "Corrige (60)": corrige,
        "Informa (25)": informa,
        "Total": total,
        "Área": registro.area || "",
        "Comentario IA": evaluacion.comentario || "Sin evaluación específica",
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
    console.error("ERROR:", error.message);
    
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        error: error.message,
      }),
    };
  }
};
