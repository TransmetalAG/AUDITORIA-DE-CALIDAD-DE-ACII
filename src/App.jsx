import { useState } from "react";
import * as XLSX from "xlsx";

export default function App() {
  const [rows, setRows] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");

  // 🔥 Normalizar texto
  const normalizar = (texto) => {
    return texto
      ?.toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  // 🔥 Limpiar encoding roto
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
      .replace(/Ã/g, "Á")
      .replace(/Â/g, "")
      .trim();
  };

  // 🔥 Obtener valor flexible
  const getValue = (row, posibles) => {
    const keys = Object.keys(row);

    for (let key of keys) {
      const cleanKey = normalizar(key);

      for (let p of posibles) {
        if (cleanKey.includes(normalizar(p))) {
          return row[key];
        }
      }
    }

    return "";
  };

  // 📥 Leer archivo
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setNombreArchivo(file.name);
    setMensaje(`Leyendo ${file.name}...`);

    try {
      const data = await file.arrayBuffer();

      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const json = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false,
      });

      if (json.length === 0) {
        setMensaje("❌ Archivo vacío");
        return;
      }

      const procesados = json.map((row) => ({
        numero: getValue(row, ["acii", "no acii"]),
        descripcion: limpiarTexto(
          getValue(row, ["descripcion", "detalle"])
        ),
        accion: limpiarTexto(
          getValue(row, [
            "accion inmediata",
            "accion correctiva",
            "accion",
          ])
        ),
        area: limpiarTexto(getValue(row, ["area"])),
      }));

      setRows(procesados);
      setMensaje(`✅ ${procesados.length} registros cargados`);

    } catch (error) {
      console.error(error);
      setMensaje("❌ Error al leer archivo");
    }
  };

  // 🤖 Evaluar IA
  const evaluarIA = async () => {
    if (rows.length === 0) {
      setMensaje("❌ Primero sube un archivo");
      return;
    }

    setLoading(true);
    setMensaje("🤖 Evaluando calidad de ACII...");

    try {
      const chunkSize = 20;
      let resultadosFinales = [];

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);

        setMensaje(
          `Procesando ${i + 1} - ${i + chunk.length} de ${rows.length}`
        );

        const res = await fetch("/.netlify/functions/evaluar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ registros: chunk }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Error IA");
        }

        resultadosFinales = [...resultadosFinales, ...data];

        await new Promise((r) => setTimeout(r, 400));
      }

      const worksheet = XLSX.utils.json_to_sheet(resultadosFinales);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");

      XLSX.writeFile(workbook, "acii_calificado.xlsx");

      setMensaje("✅ Archivo generado correctamente");

    } catch (error) {
      console.error(error);
      setMensaje(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 🧹 Limpiar
  const limpiarTodo = () => {
    setRows([]);
    setMensaje("");
    setNombreArchivo("");
  };

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      
      {/* 🔥 NUEVO TÍTULO */}
      <h1>📊 Auditoría de Calidad de ACII</h1>

      <input
        type="file"
        onChange={handleFile}
        accept=".xlsx,.xls,.csv"
      />

      <br /><br />

      {nombreArchivo && <p>📁 {nombreArchivo}</p>}

      {rows.length > 0 && (
        <div>
          <p>📊 Registros: {rows.length}</p>
          <button onClick={limpiarTodo}>Limpiar</button>
        </div>
      )}

      <br />

      {/* 🔥 BOTÓN CAMBIADO */}
      <button onClick={evaluarIA} disabled={loading || rows.length === 0}>
        {loading ? "Procesando..." : "Evaluar Calidad de ACII"}
      </button>

      <br /><br />

      {mensaje && <p><b>{mensaje}</b></p>}
    </div>
  );
}
