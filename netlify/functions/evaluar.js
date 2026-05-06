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

    const reportes = registros.map((r, i) => ({
      id: i,
      descripcion: r.descripcion || "",
      accion: r.accion || "",
    }));

    // 🔥 PROMPT ACTUALIZADO (con énfasis en verbos en pasado)
    const prompt = `
Eres un auditor SISO experto en seguridad industrial.

Debes evaluar cada reporte y devolver SOLO un array JSON con este formato:
{"relacionada": 0-30, "grupo": 0-10, "corrige": 0-60, "informa": 0-25}

REGLAS ESTRICTAS:
- relacionada = 30 si hay una CONDICIÓN INSEGURA o ACTO INSEGURO (riesgo de accidente)
- grupo = 10 si afecta a personas o un área específica
- corrige = 60 SOLO si la acción YA FUE EJECUTADA (verbos en pasado: "se reparó", "se cambió", "se limpió", "se ordenó", "se separaron", "se procedió a...", "se realizó", "se detuvo")
- NO dar corrige=60 si la acción está en imperativo ("reparar", "cambiar", "separar", "limpiar", "ordenar") o futuro ("se programará", "se planificará", "se solicitará", "se agendará")
- informa = 25 si la acción solo COMUNICA (reportar, avisar, notificar)
- NUNCA poner corrige e informa juntos. Si corrige=60, informa=0

EJEMPLOS (aprende de estos casos):

1. Descripción: "Cable eléctrico suelto en pasillo"
   Acción: "Se repara el cable"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}  // PASADO

2. Descripción: "Grasa en el suelo del área de producción"
   Acción: "Se reporta a supervisor"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

3. Descripción: "Falta de guarda en la parte del encoiler"
   Acción: ""
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

4. Descripción: "Esmeril está muy cerca de equipo de oxicorte"
   Acción: "Separar los equipos"  (IMPERATIVO, NO EJECUTADO)
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}  // 40 puntos

5. Descripción: "Esmeril está muy cerca de equipo de oxicorte"
   Acción: "Se separaron los equipos"  (PASADO, EJECUTADO)
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}  // 100 puntos

6. Descripción: "Carro obstaculizando el paso"
   Acción: "Se movió inmediatamente"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}

7. Descripción: "Carro obstaculizando el paso"
   Acción: "Mover el carro"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

8. Descripción: "Dispensador de agua no sirve" (SIN RIESGO)
   Acción: "Se reporta"
   Salida: {"relacionada": 0, "grupo": 0, "corrige": 0, "informa": 25}

9. Descripción: "Dispensador de agua no sirve, puede causar fatiga por calor extremo"
   Acción: "Se reporta"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

10. Descripción: "Temperatura normal en área de trabajo" (SIN RIESGO)
    Acción: "Ninguna"
    Salida: {"relacionada": 0, "grupo": 0, "corrige": 0, "informa": 0}

Ahora evalúa estos reportes USANDO LOS EJEMPLOS como guía:

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

    // 🔥 PALABRAS PARA DETECTAR ACCIONES REALMENTE EJECUTADAS (PASADO)
    const palabrasAccionEjecutada = [
      "se reparo", "se reparó", "se cambió", "se cambio", "se limpio", "se limpió",
      "se ordeno", "se ordenó", "se movio", "se movió", "se separaron", "se procedio",
      "se procedió", "se realizo", "se realizó", "se detuvo", "se apago", "se apagó",
      "se coloco", "se colocó", "se quito", "se quitó", "se corrigio", "se corrigió",
      "se fabrico", "se fabricó", "se instalo", "se instaló", "se hizo", "se iso"
    ];
    
    // 🔥 PALABRAS QUE INDICAN INTENCIÓN O FUTURO (NO CORRIGE)
    const palabrasIntencion = [
      "programar", "planificar", "agendar", "solicitar", "separar", "mover", 
      "limpiar", "ordenar", "reparar", "cambiar", "colocar", "quitarlo", 
      "hay que", "se debe", "sería bueno", "se necesita", "favor de",
      "se programara", "se planificara", "se agendara", "se solicitara"
    ];
    
    // 🔥 PALABRAS DE RIESGO (ampliadas)
    const palabrasRiesgoBasico = [
      "grasa", "suelo", "piso", "cable", "fuga", "electr", "canaleta",
      "guardia", "control", "energia", "peligro", "lentes", "botas",
      "extension", "desorden", "cristal", "hongo", "troquel", "faja",
      "esmeril", "oxicorte", "inflamable", "incendio", "explosion", "gas",
      "cilindro", "solvente", "aceite", "derrame", "caida", "tropiezo",
      "pernos", "alfombra", "escalera", "prensa", "resguardo"
    ];
    
    const palabrasInformaBasico = ["report", "inform", "avis", "notific", "comunic"];

    const resultados = registros.map((r, i) => {
      let ev = evaluaciones[i] || {};
      
      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;
      
      const texto = (r.descripcion || "").toLowerCase();
      const accion = (r.accion || "").toLowerCase();
      
      // 🔥 SOLO si la IA no detectó nada, aplicar reglas de emergencia
      if (relacionada === 0 && grupo === 0 && corrige === 0 && informa === 0) {
        
        // Detectar riesgo
        if (palabrasRiesgoBasico.some(p => texto.includes(p))) {
          relacionada = 30;
          grupo = 10;
        }
        
        // 🔥 DETECTAR SI LA ACCIÓN YA FUE EJECUTADA (PASADO)
        const esAccionEjecutada = palabrasAccionEjecutada.some(p => accion.includes(p));
        const esIntencion = palabrasIntencion.some(p => accion.includes(p));
        
        if (esAccionEjecutada && !esIntencion) {
          corrige = 60;
          informa = 0;
        } else if (palabrasInformaBasico.some(p => accion.includes(p))) {
          informa = 25;
        }
      }
      
      // 🔥 REGLAS DE CONSISTENCIA
      if (relacionada === 30 && grupo === 0) grupo = 10;
      if (corrige === 60) informa = 0;
      
      // 🔥 VALIDACIÓN FINAL: Si la acción es intención, anular corrige
      const accion = (r.accion || "").toLowerCase();
      const esIntencionFinal = palabrasIntencion.some(p => accion.includes(p));
      const noEsEjecutada = !palabrasAccionEjecutada.some(p => accion.includes(p));
      
      if (esIntencionFinal && noEsEjecutada && corrige === 60) {
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
