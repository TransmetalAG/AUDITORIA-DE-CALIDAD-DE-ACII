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

    // 🔥 PROMPT DEFINITIVO CON 25 EJEMPLOS
    const prompt = `
Eres un auditor SISO experto en seguridad industrial.

Debes evaluar cada reporte y devolver SOLO un array JSON con este formato:
{"relacionada": 0-30, "grupo": 0-10, "corrige": 0-60, "informa": 0-25}

REGLAS ESTRICTAS:
- relacionada = 30 si hay una CONDICIÓN INSEGURA o ACTO INSEGURO (riesgo de accidente)
- grupo = 10 si afecta a personas o un área específica
- corrige = 60 si la acción SOLUCIONA el problema (reparar, instalar, cambiar, detener, limpiar, ordenar)
- informa = 25 si la acción solo COMUNICA (reportar, avisar, notificar)
- NUNCA poner corrige e informa juntos. Si corrige=60, informa=0

EJEMPLOS (aprende de estos casos):

1. Descripción: "Cable eléctrico suelto en pasillo"
   Acción: "Se repara el cable"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}

2. Descripción: "Grasa en el suelo del área de producción"
   Acción: "Se reporta a supervisor"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

3. Descripción: "Falta de guarda en la parte del encoiler"
   Acción: ""
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

4. Descripción: "Se necesita guarda desmontable en encoiler para montar rollos"
   Acción: "Se reporta a mantenimiento"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

5. Descripción: "Troqueladora no tiene control de energías peligrosas"
   Acción: ""
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

6. Descripción: "Prensa sin resguardo de seguridad"
   Acción: "Se detiene máquina y se reporta"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}

7. Descripción: "Fajas quebradas en troqueladora"
   Acción: "Se reemplazan las fajas"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}

8. Descripción: "Trabajador no llevaba puestos sus lentes en área externa"
   Acción: "Se le recuerda usar EPP"
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

9. Descripción: "Operario sin guantes en manejo de químicos"
   Acción: ""
   Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

10. Descripción: "Personal sin casco en zona de altura"
    Acción: "Se reporta a supervisor"
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

11. Descripción: "Toma corriente en formadora está dañado, la espiga se afloja al conectar"
    Acción: ""
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

12. Descripción: "Toma eléctrica defectuosa en máquina"
    Acción: "Se reporta a mantenimiento"
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

13. Descripción: "Troqueladora activa cilindro con hongo activado"
    Acción: ""
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

14. Descripción: "Botón de emergencia anulado en prensa hidráulica"
    Acción: "Se reporta a ingeniería"
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

15. Descripción: "Las botas del colaborador necesitan cambio, están desgastadas"
    Acción: ""
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

16. Descripción: "Casco de seguridad del operario está vencido"
    Acción: "Se solicita reemplazo a bodega"
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

17. Descripción: "Extensiones atravesadas y desorden en área de trabajo"
    Acción: ""
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

18. Descripción: "Cables eléctricos cruzando el pasillo sin protección"
    Acción: "Se ordenan los cables"
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}

19. Descripción: "Puerta de cristal no tiene cinta de color señalizando que es una puerta"
    Acción: ""
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

20. Descripción: "Ventanal limpio sin señalización en área de tránsito"
    Acción: "Se coloca cinta adhesiva de color"
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0}

21. Descripción: "Se cayó la canaleta del sistema eléctrico"
    Acción: "Se reporta al soldador de mantenimiento"
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 25}

22. Descripción: "Canaleta eléctrica caída"
    Acción: ""
    Salida: {"relacionada": 30, "grupo": 10, "corrige": 0, "informa": 0}

23. Descripción: "Temperatura normal en área de trabajo" (SIN RIESGO)
    Acción: "Ninguna"
    Salida: {"relacionada": 0, "grupo": 0, "corrige": 0, "informa": 0}

24. Descripción: "Se acabó el café de la máquina" (SIN RIESGO)
    Acción: "Se avisa a servicios generales"
    Salida: {"relacionada": 0, "grupo": 0, "corrige": 0, "informa": 25}

25. Descripción: "Oficina sin novedad" (SIN RIESGO)
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

    // 🔥 RED DE SEGURIDAD MÍNIMA (solo por si acaso)
    const palabrasRiesgoBasico = [
      "grasa", "suelo", "piso", "cable", "fuga", "electr", "canaleta",
      "guardia", "control", "energia", "peligro", "lentes", "botas",
      "extension", "desorden", "cristal", "hongo", "troquel", "faja"
    ];
    const palabrasCorrigeBasico = ["repar", "corrig", "cambi", "deten", "limpia", "ordena", "coloca"];
    const palabrasInformaBasico = ["report", "inform", "avis", "notific"];

    const resultados = registros.map((r, i) => {
      let ev = evaluaciones[i] || {};
      
      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;
      
      // Emergencia: si la IA no detectó nada
      if (relacionada === 0 && grupo === 0 && corrige === 0 && informa === 0) {
        const texto = (r.descripcion || "").toLowerCase();
        const accion = (r.accion || "").toLowerCase();
        
        if (palabrasRiesgoBasico.some(p => texto.includes(p))) {
          relacionada = 30;
          grupo = 10;
        }
        
        if (palabrasCorrigeBasico.some(p => accion.includes(p))) {
          corrige = 60;
          informa = 0;
        } else if (palabrasInformaBasico.some(p => accion.includes(p))) {
          informa = 25;
        }
      }
      
      // Reglas de consistencia
      if (relacionada === 30 && grupo === 0) grupo = 10;
      if (corrige === 60 && informa !== 0) informa = 0;
      
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
