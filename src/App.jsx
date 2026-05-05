import { useState } from "react";
import * as XLSX from "xlsx";

export default function App() {
  const [rows, setRows] = useState([]);
  const [mensaje, setMensaje] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files[0];

    // 🔥 Leer archivo como texto (corrige tildes)
    const text = await file.text();

    const workbook = XLSX.read(text, { type: "string" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const json = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
    });

    console.log("Fila ejemplo:", json[0]);

    const procesados = json.map((row) => ({
      numero: (row["No. ACII"] || "").toString().trim(),
      descripcion: (row["Descripción"] || "").toString().trim(),
      accion: (row["Acción Inmediata"] || "").toString().trim(),
      area: (row["Área"] || "").toString().trim(),
    }));

    setRows(procesados);
    setMensaje("");
  };

  const evaluarIA = async () => {
    if (rows.length === 0) {
      setMensaje("Primero sube un archivo");
      return;
    }

    setMensaje("Analizando con IA...");

    try {
      const res = await fetch("/.netlify/functions/evaluar", {
        method: "POST",
        body: JSON.stringify({ registros: rows }),
      });

      const data = await res.json();

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");

      XLSX.writeFile(workbook, "acii_calificado.xlsx");

      setMensaje("Archivo generado y descargado");
    } catch (error) {
      console.error(error);
      setMensaje("Error al procesar el archivo");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Auditoría ACII</h1>

      <input type="file" onChange={handleFile} />

      <br /><br />

      <button onClick={evaluarIA}>
        Evaluar con IA
      </button>

      <br /><br />

      {rows.length > 0 && (
        <p>Registros cargados: {rows.length}</p>
      )}

      {mensaje && <p><b>{mensaje}</b></p>}
    </div>
  );
}
