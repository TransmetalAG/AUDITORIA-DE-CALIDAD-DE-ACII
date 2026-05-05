import { useState } from "react";
import * as XLSX from "xlsx";

export default function App() {
  const [rows, setRows] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);

  const limpiarTexto = (texto) => {
    if (!texto) return "";
    return texto
      .toString()
      .replace(/Ã¡/g, "á")
      .replace(/Ã©/g, "é")
      .replace(/Ã­/g, "í")
      .replace(/Ã³/g, "ó")
      .replace(/Ãº/g, "ú")
      .replace(/Ã±/g, "ñ")
      .replace(/Ã/g, "Á");
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    
    if (!file) return;
    
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setMensaje("Solo archivos Excel (.xlsx o .xls)");
      return;
    }
    
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
    });

    const procesados = json.map((row) => ({
      numero: row["No. ACII"],
      descripcion: limpiarTexto(row["Descripción"]),
      accion: limpiarTexto(row["Acción Inmediata"]),
      area: limpiarTexto(row["Área"]),
    }));

    setRows(procesados);
    setMensaje(`✅ ${procesados.length} registros cargados`);
  };

  const evaluarIA = async () => {
    if (rows.length === 0) {
      setMensaje("Primero sube un archivo");
      return;
    }

    setLoading(true);
    setMensaje("🤖 Analizando con IA...");

    try {
      const res = await fetch("/.netlify/functions/evaluar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ registros: rows }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`❌ Error: ${data.error || "desconocido"}`);
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");
      XLSX.writeFile(workbook, `acii_calificado_${new Date().toISOString().slice(0,19)}.xlsx`);

      setMensaje("✅ Archivo generado y descargado");
    } catch (error) {
      console.error(error);
      setMensaje("❌ Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>📋 Auditoría ACII</h1>

      <input type="file" onChange={handleFile} accept=".xlsx,.xls" />

      <br /><br />

      <button 
        onClick={evaluarIA} 
        disabled={loading || rows.length === 0}
        style={{
          padding: "10px 20px",
          backgroundColor: loading ? "#ccc" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: loading ? "not-allowed" : "pointer"
        }}
      >
        {loading ? "Procesando..." : "🎯 Evaluar con IA"}
      </button>

      <br /><br />

      {rows.length > 0 && (
        <p>📊 Registros cargados: <strong>{rows.length}</strong></p>
      )}

      {mensaje && <p><b>{mensaje}</b></p>}
    </div>
  );
}
