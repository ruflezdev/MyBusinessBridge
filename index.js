if (typeof AbortSignal !== "undefined" && !AbortSignal.any) {
  AbortSignal.any = function (signals) {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        return controller.signal;
      }
      signal.addEventListener("abort", () => controller.abort(signal.reason), {
        once: true,
      });
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
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function iniciarServidor(pool) {
  app.get("/productos/buscar", async (req, res) => {
    const busqueda = req.query.q;
    try {
      const result = await pool
        .request()
        .input("q", sql.VarChar, `%${busqueda}%`).query(`
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
      const result = await pool
        .request()
        .input("id", sql.VarChar, req.params.id).query(`
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

  app.post("/producto/actualizar", async (req, res) => {
    const { CodigoBarras, Producto, PrecioPublico, Existencias } = req.body;

    try {
      const exists = await pool
        .request()
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

      await pool
        .request()
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

function obtenerIPLocal() {
  const interfaces = os.networkInterfaces();
  const localIPs = [];
  for (const name in interfaces) {
    for (const details of interfaces[name]) {
      if (details.family === "IPv4" && !details.internal) {
        localIPs.push(details.address);
      }
    }
  }

  if (localIPs.length > 0) {
    if (localIPs.length > 1) {
      console.log(
        "\n⚠️  Múltiples IPs locales de red detectadas. Usando la primera:",
      );
      localIPs.forEach((ip, index) => console.log(`   ${index + 1}. ${ip}`));
    }
    return localIPs[0];
  } else {
    console.log(
      "\n⚠️  No se encontró una IP IPv4 de red externa. Usando 'localhost'.",
    );
    return "localhost";
  }
}

async function probarYGuardar(config) {
  try {
    const pool = await sql.connect(config);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log("\n✅ Conexión con MyBusiness POS establecida.");
    iniciarServidor(pool);
  } catch (err) {
    console.log(`\n❌ Error al conectar: ${err.message}`);
    console.log(
      "Por favor, verifica los datos de conexión y que el servidor SQL esté en ejecución.",
    );
    pedirDatos();
  }
}

function pedirDatos() {
  console.log("\n--- CONFIGURACIÓN SQL ---");
  console.log(
    "1. Automática (intenta conectar a la IP local con usuario 'sa', clave '12345678', DB 'MyBusiness20', puerto 53100)",
  );
  console.log(
    "2. Manual (ingresar todos los datos: IP, puerto, base de datos, usuario y contraseña)",
  );
  rl.question("Opción (1 o 2): ", (op) => {
    if (op === "1") {
      console.log("\nIntentando conexión automática...");
      const config = {
        user: "sa",
        password: "12345678",
        server: obtenerIPLocal(),
        database: "MyBusiness20",
        port: 53100,
        options: { encrypt: false, trustServerCertificate: true },
      };
      probarYGuardar(config);
    } else if (op === "2") {
      rl.question("IP del Servidor SQL (ej. localhost): ", (server) => {
        rl.question("Puerto (default: 53100): ", (port) => {
          rl.question("Nombre de la Base de Datos (default: MyBusiness20): ", (database) => {
            rl.question("Usuario (default: sa): ", (user) => {
              rl.question("Contraseña: ", (password) => {
                const finalConfig = {
                  server: server || 'localhost',
                  port: parseInt(port) || 53100,
                  database: database || 'MyBusiness20',
                  user: user || 'sa',
                  password: password, // La contraseña es obligatoria
                  options: { encrypt: false, trustServerCertificate: true },
                };
                console.log(`\nIntentando conexión con la configuración proporcionada...`);
                probarYGuardar(finalConfig);
              });
            });
          });
        });
      });
    } else {
      console.log("Opción no válida. Por favor, ingrese '1' o '2'.");
      pedirDatos(); // Volver a pedir datos si la opción no es válida
    }
  });
}

if (fs.existsSync(CONFIG_FILE)) {
  sql
    .connect(JSON.parse(fs.readFileSync(CONFIG_FILE)))
    .then(iniciarServidor)
    .catch(pedirDatos);
} else {
  pedirDatos();
}
