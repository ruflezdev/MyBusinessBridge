if (typeof AbortSignal !== "undefined" && !AbortSignal.any) {
  AbortSignal.any = function (signals) {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        return controller.signal;
      }
      signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
  };
}

const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const readline = require("readline");

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG_FILE = "./config.json";
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// =====================================================
// 2. RUTAS DE LA API (Alta Rápida Z004)
// =====================================================
function iniciarServidor(pool) {
  
  // NUEVO: Búsqueda general (coincidencias parciales por nombre o código)
  app.get("/productos/buscar", async (req, res) => {
    const busqueda = req.query.q;
    try {
      const result = await pool.request()
        .input("q", sql.VarChar, `%${busqueda}%`)
        .query(`
          SELECT TOP 30
                 articulo AS CodigoBarras, 
                 descrip AS Producto, 
                 precio1 AS PrecioPublico, 
                 existencia AS Existencias
          FROM prods 
          WHERE articulo LIKE @q OR descrip LIKE @q
          ORDER BY descrip ASC
        `);
      
      res.json(result.recordset);
    } catch (err) { 
      res.status(500).json({ error: err.message }); 
    }
  });

  // CONSULTAR: Busca por Código de Barras exacto
  app.get("/producto/:id", async (req, res) => {
    try {
      const result = await pool.request()
        .input("id", sql.VarChar, req.params.id)
        .query(`
          SELECT articulo AS CodigoBarras, 
                 descrip AS Producto, 
                 precio1 AS PrecioPublico, 
                 existencia AS Existencias
          FROM prods 
          WHERE articulo = @id
        `);
      
      if (result.recordset.length > 0) {
        res.json(result.recordset[0]);
      } else {
        res.status(404).json({ message: "No encontrado" });
      }
    } catch (err) { 
      res.status(500).json({ error: err.message }); 
    }
  });

  // GUARDAR: Alta o Actualización
  app.post("/producto/actualizar", async (req, res) => {
    const { CodigoBarras, Producto, PrecioPublico, Existencias } = req.body;

    try {
      const exists = await pool.request()
        .input("c", sql.VarChar, CodigoBarras)
        .query("SELECT articulo FROM prods WHERE articulo=@c");

      let query;
      if (exists.recordset.length > 0) {
        query = `UPDATE prods SET descrip=@d, precio1=@p, costo_u=0, 
                 impuesto='SYS', existencia=@e WHERE articulo=@c`;
      } else {
        query = `INSERT INTO prods (articulo, descrip, precio1, costo_u, impuesto, 
                 existencia, linea, marca, unidad, paraventa, invent) 
                 VALUES (@c, @d, @p, 0, 'SYS', @e, 'SYS', 'SYS', 'PZA', 1, 1)`;
      }

      await pool.request()
        .input("c", sql.VarChar, CodigoBarras)
        .input("d", sql.VarChar, Producto)
        .input("p", sql.Float, PrecioPublico)
        .input("e", sql.Float, Existencias || 0)
        .query(query);

      console.log(`✅ Registro exitoso: ${CodigoBarras} - ${Producto}`);
      res.send("OK");
    } catch (err) { 
      res.status(500).json({ error: err.message }); 
    }
  });

  app.listen(3000, "0.0.0.0", () => {
    console.log(`\n🚀 API ALTA RÁPIDA Z004 LISTA`);
    console.log(`IP de red para la App: http://${obtenerIPLocal()}:3000`);
  });
}

// =====================================================
// 3. GESTIÓN DE RED Y CONFIGURACIÓN
// =====================================================
function obtenerIPLocal() {
  const interfaces = os.networkInterfaces();
  for (let name in interfaces) {
    for (let details of interfaces[name]) {
      if (details.family === "IPv4" && !details.internal) return details.address;
    }
  }
  return "localhost";
}

async function probarYGuardar(config) {
  try {
    const pool = await sql.connect(config);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log("✅ Conexión con MyBusiness POS establecida.");
    iniciarServidor(pool);
  } catch (err) {
    console.log("❌ Error:", err.message);
    pedirDatos();
  }
}

function pedirDatos() {
  console.log("\n--- CONFIGURACIÓN SQL ---");
  console.log("1. Automática (sa / 12345678)");
  console.log("2. Manual");
  rl.question("Opción: ", (op) => {
    if (op === "1") {
      probarYGuardar({
        user: "sa", password: "12345678", server: obtenerIPLocal(),
        database: "MyBusiness20", port: 53100,
        options: { encrypt: false, trustServerCertificate: true }
      });
    } else {
      rl.question("IP Servidor: ", (h) => {
        rl.question("Clave sa: ", (p) => {
          probarYGuardar({
            user: "sa", password: p, server: h,
            database: "MyBusiness20", port: 53100,
            options: { encrypt: false, trustServerCertificate: true }
          });
        });
      });
    }
  });
}

if (fs.existsSync(CONFIG_FILE)) {
  sql.connect(JSON.parse(fs.readFileSync(CONFIG_FILE)))
    .then(iniciarServidor).catch(pedirDatos);
} else {
  pedirDatos();
}