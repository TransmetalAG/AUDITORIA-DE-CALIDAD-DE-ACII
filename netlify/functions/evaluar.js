export async function handler(event) {
  const { registros } = JSON.parse(event.body);

  const evaluados = registros.map((r) => {
    let descripcion = (r.descripcion || "").toLowerCase();
    let accion = (r.accion || "").toLowerCase();

    // 🔹 Relacionada SISO (30)
    let relacionada = 0;
    if (
      descripcion.includes("fuga") ||
      descripcion.includes("riesgo") ||
      descripcion.includes("epp") ||
      descripcion.includes("montacargas") ||
      descripcion.includes("seguridad")
    ) {
      relacionada = 30;
    }

    // 🔹 Grupo específico (10)
    let grupo = 0;
    if (
      descripcion.includes("colaborador") ||
      descripcion.includes("operador") ||
      descripcion.includes("área")
    ) {
      grupo = 10;
    }

    // 🔹 Corrige vs Informa
    let corrige = 0;
    let informa = 0;

    if (
      accion.includes("se corrige") ||
      accion.includes("se le indica") ||
      accion.includes("se le pide") ||
      accion.includes("se coloca") ||
      accion.includes("se ajusta")
    ) {
      corrige = 60;
    } else if (
      accion.includes("se reporta") ||
      accion.includes("se informa")
    ) {
      informa = 25;
    }

    let total = relacionada + grupo + corrige + informa;

    return {
      "No. ACII": r.numero,
      "Descripción": r.descripcion,
      "Acción Inmediata": r.accion,
      "Relacionada SISO (30)": relacionada,
      "Grupo específico (10)": grupo,
      "Corrige (60)": corrige,
      "Informa (25)": informa,
      "Total": total,
    };
  });

  return {
    statusCode: 200,
    body: JSON.stringify(evaluados),
  };
}
