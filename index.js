/**
 * PARCHE DE COMPATIBILIDAD
 * Soluciona el error "AbortSignal.any is not a function" en entornos empaquetados.
 */
if (typeof AbortSignal !== 'undefined' && !AbortSignal.any) {
    AbortSignal.any = function(signals) {
        const controller = new AbortController();
        for (const signal of signals) {
            if (signal.aborted) {
                controller.abort(signal.reason);
                return controller.signal;
            }
            signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
        }
        return controller.signal;
    };
}

const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const os = require('os');
const fs = require('fs');
const readline = require('readline');

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG_FILE = './config.json';
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// --- MONITOR DE DISPOSITIVOS ---
app.use((req, res, next) => {
    const ip = req.socket.remoteAddress.replace(/^.*:/, '') || 'Local';
    const hora = new Date().toLocaleTimeString();
    console.log(`[${hora}] 📱 SOLICITUD: ${ip} -> ${req.method} ${req.url}`);
    next();
});

function mostrarIPs() {
    console.log("\n====================================================");
    console.log("           ESTAS SON TUS DIRECCIONES IP             ");
    console.log("      (Usa una de estas en tu App de Android)       ");
    console.log("====================================================");
    const interfaces = os.networkInterfaces();
    for (let name in interfaces) {
        interfaces[name].forEach((details) => {
            if (details.family === 'IPv4') {
                console.log(` Adaptador [${name}]: ${details.address}`);
            }
        });
    }
    console.log("====================================================\n");
}

async function iniciarApp() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            console.log("🔍 Conectando con configuración guardada...");
            const pool = await intentarConectar(savedConfig);
            if (pool) {
                console.log(`✅ BASE DE DATOS CONECTADA: ${savedConfig.database}`);
                iniciarServidor(pool);
            } else {
                console.log("\n⚠️ Error de conexión. Vamos a reconfigurar.");
                pedirDatos();
            }
        } else {
            console.log("👋 Bienvenido, José Rubén. Configura tu puente.");
            pedirDatos();
        }
    } catch (err) {
        console.error("\n❌ ERROR:", err.message);
        pedirDatos();
    }
}

async function intentarConectar(config) {
    try {
        const pool = await new sql.ConnectionPool({
            ...config,
            connectionTimeout: 10000,
            requestTimeout: 30000,
            options: { encrypt: false, trustServerCertificate: true }
        }).connect();
        return pool;
    } catch (err) { return null; }
}

function pedirDatos() {
    mostrarIPs();
    rl.question('1. Servidor/IP: ', (host) => {
        rl.question('2. Puerto (53100): ', (portIn) => {
            const port = parseInt(portIn) || 53100;
            rl.question('3. Base de Datos: ', (db) => {
                rl.question('4. Usuario (sa): ', (user) => {
                    rl.question('5. Contraseña: ', (pass) => {
                        const conf = { user, password: pass, server: host, database: db, port,
                            options: { encrypt: false, trustServerCertificate: true }
                        };
                        probarYGuardar(conf);
                    });
                });
            });
        });
    });
}

async function probarYGuardar(config) {
    try {
        let pool = await sql.connect(config);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        console.log("✅ Configuración guardada.");
        iniciarServidor(pool);
    } catch (err) {
        console.error('\n❌ ERROR:', err.message);
        pedirDatos();
    }
}

function iniciarServidor(pool) {

    // 1. LISTAR TODOS (READ)
    app.get('/productos', async (req, res) => {
        try {
            const result = await pool.request().query(`
                SELECT articulo AS Articulo, descrip AS Descripcion, existencia AS Stock, precio1 AS Precio
                FROM prods ORDER BY descrip
            `);
            console.log(`📦 INFO: Enviados ${result.recordset.length} productos.`);
            res.json(result.recordset);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 2. BUSCAR POR CÓDIGO (READ ONE)
    app.get('/producto/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.request()
                .input('codigo', sql.VarChar, id)
                .query(`
                    SELECT articulo AS Articulo, descrip AS Descripcion, existencia AS Stock, precio1 AS Precio 
                    FROM prods WHERE articulo = @codigo
                `);
            
            if (result.recordset.length > 0) {
                res.json(result.recordset[0]);
            } else {
                res.status(404).send("No encontrado");
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 3. ACTUALIZAR O INSERTAR (CREATE / UPDATE)
    app.post('/producto/actualizar', async (req, res) => {
        const { Articulo, Descripcion, Stock, Precio } = req.body;
        try {
            // Verificamos si ya existe el producto
            const exists = await pool.request()
                .input('c', sql.VarChar, Articulo)
                .query('SELECT articulo FROM prods WHERE articulo = @c');
            
            let query;
            if (exists.recordset.length > 0) {
                // Si existe, actualizamos
                query = 'UPDATE prods SET descrip = @d, existencia = @s, precio1 = @p WHERE articulo = @c';
            } else {
                // Si no existe, insertamos (Producto Nuevo)
                query = 'INSERT INTO prods (articulo, descrip, existencia, precio1) VALUES (@c, @d, @s, @p)';
            }

            await pool.request()
                .input('c', sql.VarChar, Articulo)
                .input('d', sql.VarChar, Descripcion)
                .input('s', sql.Float, Stock)
                .input('p', sql.Float, Precio)
                .query(query);
            
            console.log(`💾 GUARDADO: [${Articulo}] ${Descripcion}`);
            res.send("OK");
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 4. ELIMINAR (DELETE)
    app.delete('/productos/:id', async (req, res) => {
        const { id } = req.params;
        try {
            await pool.request()
                .input('codigo', sql.VarChar, id)
                .query('DELETE FROM prods WHERE articulo = @codigo');
            console.log(`🔥 ALERTA: Producto [${id}] ELIMINADO.`);
            res.send("Eliminado");
        } catch (err) { 
            res.status(500).send("Error"); 
        }
    });

    app.listen(3000, '0.0.0.0', () => {
        console.log("\n🚀 INTERMEDIO LISTO EN PUERTO 3000");
        console.log("Esperando conexiones desde la App Android...\n");
    });
}

iniciarApp();