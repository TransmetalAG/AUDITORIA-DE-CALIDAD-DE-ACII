import { useState } from "react";
import * as XLSX from "xlsx";

export default function App() {
  const [rows, setRows] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");

  // 🔥 Leer CSV correctamente (LATIN1)
  const leerCSV = (texto) => {
    const lines = texto.split(/\r?\n/);
    const headers = lines[0].split(",").map(h => h.replace(/["']/g, "").trim());

    const json = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "") continue;

      const values = [];
      let current = "";
      let inQuotes = false;

      for (let char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current);

      const row = {};
      headers.forEach((h, idx) => {
        let val = values[idx] || "";
        val = val.replace(/^["']|["']$/g, "");
        row[h] = val;
      });

      json.push(row);
    }

    return json;
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setNombreArchivo(file.name);
    setMensaje(`Leyendo ${file.name}...`);

    const extension = file.name.split('.').pop().toLowerCase();

    try {
      let json = [];

      if (extension === "csv") {
        // 🔥 CORRECCIÓN CLAVE AQUÍ
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder("latin1");
        const text = decoder.decode(buffer);

        json = leerCSV(text);
        setMensaje(`✅ CSV leído: ${json.length} registros`);
      } 
      else if (extension === "xlsx" || extension === "xls") {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        json = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
          raw: false,
        });
        setMensaje(`✅ Excel leído: ${json.length} registros`);
      } 
      else {
        setMensaje("❌ Solo CSV o Excel");
        return;
      }

      if (json.length === 0) {
        setMensaje("❌ Archivo vacío");
        return;
      }

      // 🔥 VALIDACIÓN FLEXIBLE (SIN PROBLEMAS DE TILDES)
      const primeraFila = json[0];

      const getValue = (row, posibles) => {
        const key = Object.keys(row).find(k =>
          posibles.some(p =>
            k.toLowerCase().includes(p)
          )
        );
        return key ? row[key] : "";
      };

      const procesados = json.map((row) => ({
        numero: getValue(row, ["acii"]),
        descripcion: getValue(row, ["descrip"]),
        accion: getValue(row, ["accion inmediata"]),
        area: getValue(row, ["area"]),
      }));

      setRows(procesados);
      setMensaje(`✅ ${procesados.length} registros cargados`);

    } catch (error) {
      console.error(error);
      setMensaje(`❌ Error: ${error.message}`);
    }
  };

  const evaluarIA = async () => {
    if (rows.length === 0) {
      setMensaje("❌ Primero sube archivo");
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
        setMensaje(`❌ ${data.error}`);
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");

      XLSX.writeFile(workbook, "acii_calificado.xlsx");

      setMensaje("✅ Archivo generado correctamente");

    } catch (error) {
      console.error(error);
      setMensaje("❌ Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>📋 Auditoría ACII con IA</h1>

      <input
        type="file"
        onChange={handleFile}
        accept=".xlsx,.xls,.csv"
      />

      <br /><br />

      <button onClick={evaluarIA} disabled={loading}>
        {loading ? "Procesando..." : "Evaluar con IA"}
      </button>

      <br /><br />

      {rows.length > 0 && <p>Registros: {rows.length}</p>}

      {mensaje && <p><b>{mensaje}</b></p>}
    </div>
  );
}
