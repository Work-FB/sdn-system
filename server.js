require('dotenv').config();

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ===========================================================
   IMAGENES
==============================================================*/
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

/* ===========================================================
   POSTGRESQL CONNECTION
==============================================================*/
// Endpoint para verificar contraseña de acceso admin
app.post("/verify-admin-access", async (req, res) => {
    const { password } = req.body;
    const SECRET_KEY = process.env.ADMIN_ACCESS_PASSWORD || 'admin12';
    
    if (password === SECRET_KEY) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ===========================================================
// CLASIFICACIÓN DE ENDPOINTS
// ===========================================================

// 1. ENDPOINTS PÚBLICOS (no requieren autenticación)
//    - Ver menú, productos, precios
//    - Registrar ventas rápidas
//    - Ver información básica

// 2. ENDPOINTS PROTEGIDOS (requieren login de admin)
//    - Gestión de empleados
//    - Reportes y cuadres
//    - Editar áreas de clientes
//    - Inventario, gastos, etc.

// ===========================================================
// MIDDLEWARE DE ADMIN (nuevo)
// ===========================================================
const verificarAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "Se requiere autenticación de administrador" });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: "Token inválido" });
    }
    
    try {
        const result = await query(`SELECT id, nombre, rol FROM usuarios WHERE id = $1 AND rol = 'admin'`, [token]);
        if (result.rows.length === 0) {
            return res.status(403).json({ error: "Acceso solo para administradores" });
        }
        
        req.admin = result.rows[0];
        next();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ===========================================================
// ENDPOINTS PÚBLICOS (cualquiera puede usar)
// ===========================================================

// Ver menú público
app.get("/public/menus", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM menus WHERE disponible = 1 ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ver productos públicos (solo nombres y precios)
app.get("/public/productos", async (req, res) => {
    try {
        const result = await query(`SELECT id, nombre, precio, categoria FROM menus WHERE disponible = 1`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Registrar venta pública (sin login)
app.post("/public/venta-rapida", async (req, res) => {
    const { producto, cantidad, precio } = req.body;
    const total = cantidad * precio;
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo" });
    const hora = ahora.toLocaleTimeString("es-DO", { timeZone: "America/Santo_Domingo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    
    try {
        await query(
            `INSERT INTO ventas(producto, cantidad, precio, total, fecha, hora) VALUES ($1, $2, $3, $4, $5, $6)`,
            [producto, cantidad, precio, total, fecha, hora]
        );
        res.json({ mensaje: "Venta registrada", total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================================================
// ENDPOINTS PROTEGIDOS (solo admin)
// ===========================================================

// Aplicar middleware de admin a todas las rutas administrativas
app.use("/admin/", verificarAdmin);

// Ejemplo: Endpoint para editar área de cliente (ahora protegido)
app.put("/admin/area-cliente/:id", async (req, res) => {
    const clienteId = req.params.id;
    const { contenido } = req.body;
    
    try {
        await query(
            `INSERT INTO areas_clientes(usuario_id, contenido, actualizado_por, actualizado_en)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (usuario_id) 
             DO UPDATE SET contenido = $2, actualizado_por = $3, actualizado_en = CURRENT_TIMESTAMP`,
            [clienteId, JSON.stringify(contenido), req.admin.id]
        );
        
        res.json({ mensaje: "Área actualizada correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtener todos los clientes (solo admin)
app.get("/admin/clientes", async (req, res) => {
    try {
        const clientes = await query(`
            SELECT u.id, u.nombre, u.usuario, u.telefono, u.estado, 
                   a.contenido, a.actualizado_en
            FROM usuarios u
            LEFT JOIN areas_clientes a ON u.id = a.usuario_id
            WHERE u.rol = 'cliente'
            ORDER BY u.id DESC
        `);
        res.json(clientes.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mantener endpoints existentes pero moverlos a /admin/
// Por ejemplo: /crear-empleado → /admin/crear-empleado
// /gastos → /admin/gastos, etc.

// Aplicar a rutas protegidas
app.use("/api/", autenticar); // Todas las rutas /api/* requerirán autenticación




// Función helper para consultas
const query = (text, params) => pool.query(text, params);

// Crear todas las tablas con la estructura CORRECTA
const initDB = async () => {
    try {
        // Usuarios - versión COMPLETA con todas las columnas necesarias
        await query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                usuario TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                rol TEXT NOT NULL,
                telefono TEXT,
                salario REAL,
                estado TEXT DEFAULT 'Activo',
                fecha_ingreso TEXT
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS cuadres (
                id SERIAL PRIMARY KEY,
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL,
                total_ventas REAL NOT NULL,
                total_efectivo REAL NOT NULL
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS gastos (
                id SERIAL PRIMARY KEY,
                descripcion TEXT NOT NULL,
                monto REAL NOT NULL,
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS productos_vendidos (
                id SERIAL PRIMARY KEY,
                cuadre_id INTEGER REFERENCES cuadres(id),
                producto TEXT NOT NULL,
                precio REAL NOT NULL
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS asistencia (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                tipo TEXT NOT NULL,
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS menus (
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                precio REAL NOT NULL,
                categoria TEXT,
                imagen TEXT,
                disponible INTEGER DEFAULT 1
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS productos (
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                categoria TEXT,
                stock INTEGER DEFAULT 0,
                costo REAL DEFAULT 0,
                suplidor TEXT,
                imagen TEXT,
                fecha TEXT
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS movimientos (
                id SERIAL PRIMARY KEY,
                producto_id INTEGER REFERENCES productos(id),
                tipo TEXT NOT NULL,
                cantidad INTEGER NOT NULL,
                detalle TEXT,
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS ventas (
                id SERIAL PRIMARY KEY,
                producto TEXT NOT NULL,
                cantidad INTEGER NOT NULL,
                precio REAL NOT NULL,
                total REAL NOT NULL,
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS depositos (
                id SERIAL PRIMARY KEY,
                cliente TEXT NOT NULL,
                monto REAL NOT NULL,
                banco TEXT,
                referencia TEXT,
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS dolares (
                id SERIAL PRIMARY KEY,
                uno INTEGER DEFAULT 0,
                dos INTEGER DEFAULT 0,
                cinco INTEGER DEFAULT 0,
                diez INTEGER DEFAULT 0,
                veinte INTEGER DEFAULT 0,
                cincuenta INTEGER DEFAULT 0,
                cien INTEGER DEFAULT 0,
                tasa REAL NOT NULL,
                total_usd REAL NOT NULL,
                total_dop REAL NOT NULL,
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS caja (
                id SERIAL PRIMARY KEY,
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL,
                total_ventas REAL DEFAULT 0,
                total_gastos REAL DEFAULT 0,
                total_depositos REAL DEFAULT 0,
                total_dolares REAL DEFAULT 0,
                total_final REAL DEFAULT 0,
                faltante REAL DEFAULT 0,
                estado TEXT NOT NULL,
                observacion TEXT
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS decomiso (
                id SERIAL PRIMARY KEY,
                producto TEXT NOT NULL,
                cantidad INTEGER NOT NULL,
                motivo TEXT NOT NULL,
                responsable TEXT,
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL
            )
        `);

        console.log("✅ Tablas creadas/verificadas en PostgreSQL");
    } catch (err) {
        console.error("❌ Error creando tablas:", err);
    }
};

initDB();

/* =========================
   REGISTRO
========================= */
app.post("/register", async (req, res) => {
    const { nombre, usuario, password, rol } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await query(
            `INSERT INTO usuarios(nombre, usuario, password, rol) VALUES ($1, $2, $3, $4) RETURNING id`,
            [nombre, usuario, hashedPassword, rol]
        );
        res.json({ mensaje: "Usuario registrado", id: result.rows[0].id });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/* =========================
   CREAR EMPLEADO (CORREGIDO)
========================= */
app.post("/crear-empleado", async (req, res) => {
    const { nombre, usuario, password, rol, telefono, salario } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const fechaIngreso = new Date().toLocaleDateString();
        
        await query(
            `INSERT INTO usuarios(nombre, usuario, password, rol, telefono, salario, estado, fecha_ingreso)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [nombre, usuario, hashedPassword, rol, telefono || null, salario || 0, "Activo", fechaIngreso]
        );
        res.json({ mensaje: "Empleado creado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/empleados-completo", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM usuarios ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/eliminar-empleado/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await query(`DELETE FROM usuarios WHERE id = $1`, [id]);
        res.json({ mensaje: "Empleado eliminado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   LOGIN
========================= */
// En tu endpoint /login, actualiza la respuesta:
app.post("/login", async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const result = await query(`SELECT * FROM usuarios WHERE usuario = $1`, [usuario]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: "Contraseña incorrecta" });
        
        // Devolver el ID para usarlo como token
        res.json({
            mensaje: "Login correcto",
            usuario: { 
                id: user.id, 
                nombre: user.nombre, 
                rol: user.rol 
            },
            token: user.id.toString() // En producción usa JWT
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   VENTAS
========================= */
app.post("/crear-venta", async (req, res) => {
    const { producto, cantidad, precio } = req.body;
    const total = cantidad * precio;

const ahora = new Date();

const fecha = ahora.toLocaleDateString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo"
    }
);

const hora = ahora.toLocaleTimeString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }
);
    
    try {
        await query(
            `INSERT INTO ventas(producto, cantidad, precio, total, fecha, hora) VALUES ($1, $2, $3, $4, $5, $6)`,
            [producto, cantidad, precio, total, fecha, hora]
        );
        res.json({ mensaje: "Venta registrada", total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/ventas", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM ventas ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   GASTOS
========================= */
app.post("/crear-gasto", async (req, res) => {
    const { descripcion, monto } = req.body;
    const ahora = new Date();

const fecha = ahora.toLocaleDateString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo"
    }
);

    const hora = ahora.toLocaleTimeString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }
);
    
    try {
        await query(`INSERT INTO gastos(descripcion, monto, fecha, hora) VALUES ($1, $2, $3, $4)`,
            [descripcion, monto, fecha, hora]);
        res.json({ mensaje: "Gasto registrado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/gastos", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM gastos ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   DEPOSITOS
========================= */
app.post("/crear-deposito", async (req, res) => {
    const { cliente, monto, banco, referencia } = req.body;
    const ahora = new Date();

const fecha = ahora.toLocaleDateString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo"
    }
);

    const hora = ahora.toLocaleTimeString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }
);
    
    try {
        await query(
            `INSERT INTO depositos(cliente, monto, banco, referencia, fecha, hora) VALUES ($1, $2, $3, $4, $5, $6)`,
            [cliente, monto, banco, referencia, fecha, hora]
        );
        res.json({ mensaje: "Depósito registrado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/depositos", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM depositos ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   DOLARES
========================= */
app.post("/guardar-dolares", async (req, res) => {
    const { uno, dos, cinco, diez, veinte, cincuenta, cien, tasa } = req.body;
    const totalUSD = (uno*1) + (dos*2) + (cinco*5) + (diez*10) + (veinte*20) + (cincuenta*50) + (cien*100);
    const totalDOP = totalUSD * tasa;
    const ahora = new Date();

const fecha = ahora.toLocaleDateString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo"
    }
);

    const hora = ahora.toLocaleTimeString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }
);
    
    try {
        await query(
            `INSERT INTO dolares(uno, dos, cinco, diez, veinte, cincuenta, cien, tasa, total_usd, total_dop, fecha, hora)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [uno, dos, cinco, diez, veinte, cincuenta, cien, tasa, totalUSD, totalDOP, fecha, hora]
        );
        res.json({ mensaje: "Dólares registrados", totalUSD, totalDOP });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/dolares", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM dolares ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   REPORTE FINAL
========================= */
app.get("/reporte-final", async (req, res) => {
    try {
        const ventas = await query(`SELECT COALESCE(SUM(total), 0) as totalVentas FROM ventas`);
        const gastos = await query(`SELECT COALESCE(SUM(monto), 0) as totalGastos FROM gastos`);
        const depositos = await query(`SELECT COALESCE(SUM(monto), 0) as totalDepositos FROM depositos`);
        const dolares = await query(`SELECT COALESCE(SUM(total_dop), 0) as totalDolares FROM dolares`);
        
        const totalVentas = parseFloat(ventas.rows[0].totalventas);
        const totalGastos = parseFloat(gastos.rows[0].totalgastos);
        const totalDepositos = parseFloat(depositos.rows[0].totaldepositos);
        const totalDolares = parseFloat(dolares.rows[0].totaldolares);
        const totalFinal = totalVentas - totalGastos + totalDepositos + totalDolares;
        
        res.json({ totalVentas, totalGastos, totalDepositos, totalDolares, totalFinal });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   CAJA
========================= */
app.post("/guardar-caja", async (req, res) => {
    const { total_ventas, total_gastos, total_depositos, total_dolares, total_final, faltante, estado, observacion } = req.body;
    const ahora = new Date();

const fecha = ahora.toLocaleDateString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo"
    }
);

    const hora = ahora.toLocaleTimeString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }
);
    
    try {
        await query(
            `INSERT INTO caja(fecha, hora, total_ventas, total_gastos, total_depositos, total_dolares, total_final, faltante, estado, observacion)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [fecha, hora, total_ventas, total_gastos, total_depositos, total_dolares, total_final, faltante, estado, observacion]
        );
        res.json({ mensaje: "Caja guardada correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/caja", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM caja ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   INVENTARIO - MOVIMIENTOS
========================= */
app.post("/crear-movimiento", async (req, res) => {
    const { producto_id, tipo, cantidad, detalle } = req.body;
    const ahora = new Date();

const fecha = ahora.toLocaleDateString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo"
    }
);

    const hora = ahora.toLocaleTimeString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }
);
    
    try {
        const producto = await query(`SELECT stock FROM productos WHERE id = $1`, [producto_id]);
        if (!producto.rows[0]) return res.status(404).json({ error: "Producto no encontrado" });
        
        let nuevoStock = producto.rows[0].stock;
        if (tipo === "ENTRADA") nuevoStock += parseInt(cantidad);
        if (tipo === "SALIDA") nuevoStock = Math.max(0, nuevoStock - parseInt(cantidad));
        
        await query(`UPDATE productos SET stock = $1 WHERE id = $2`, [nuevoStock, producto_id]);
        await query(
            `INSERT INTO movimientos(producto_id, tipo, cantidad, detalle, fecha, hora) VALUES ($1, $2, $3, $4, $5, $6)`,
            [producto_id, tipo, cantidad, detalle, fecha, hora]
        );
        res.json({ mensaje: "Movimiento registrado", stock: nuevoStock });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/movimientos", async (req, res) => {
    try {
        const result = await query(`
            SELECT movimientos.*, productos.nombre 
            FROM movimientos 
            INNER JOIN productos ON productos.id = movimientos.producto_id 
            ORDER BY movimientos.id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   MENU
========================= */
app.post("/crear-menu", upload.single("imagen"), async (req, res) => {
    const { nombre, precio, categoria } = req.body;
    const imagen = req.file ? req.file.filename : null;
    
    try {
        await query(`INSERT INTO menus(nombre, precio, categoria, imagen) VALUES ($1, $2, $3, $4)`,
            [nombre, precio, categoria, imagen]);
        res.json({ mensaje: "Producto agregado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/menus", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM menus ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/eliminar-menu/:id", async (req, res) => {
    const id = req.params.id;
    try {
        await query(`DELETE FROM menus WHERE id = $1`, [id]);
        res.json({ mensaje: "Producto eliminado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   PRODUCTOS
========================= */
app.post("/crear-producto", upload.single("imagen"), async (req, res) => {
    const { nombre, categoria, stock, costo, suplidor } = req.body;
    const imagen = req.file ? req.file.filename : null;
    const ahora = new Date();

const fecha = ahora.toLocaleDateString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo"
    }
);

    
    try {
        await query(
            `INSERT INTO productos(nombre, categoria, stock, costo, suplidor, imagen, fecha) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [nombre, categoria, stock, costo, suplidor, imagen, fecha]
        );
        res.json({ mensaje: "Producto agregado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/productos", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM productos ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/eliminar-producto/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await query(`DELETE FROM productos WHERE id = $1`, [id]);
        res.json({ mensaje: "Producto eliminado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   EMPLEADOS (lista simple)
========================= */
app.get("/empleados", async (req, res) => {
    try {
        const result = await query(`SELECT id, nombre FROM usuarios`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   ASISTENCIA
========================= */
app.post("/asistencia", async (req, res) => {
    const { usuario_id, tipo } = req.body;
    const ahora = new Date();

const fecha = ahora.toLocaleDateString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo"
    }
);

    const hora = ahora.toLocaleTimeString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }
);
    
    try {
        await query(`INSERT INTO asistencia(usuario_id, tipo, fecha, hora) VALUES ($1, $2, $3, $4)`,
            [usuario_id, tipo, fecha, hora]);
        res.json({ mensaje: `${tipo} registrada con éxito`, fecha, hora });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   CUADRE (Control de ventas)
========================= */
app.post("/guardar-cuadre", async (req, res) => {
    const { total_ventas, total_efectivo, productos } = req.body;
    const ahora = new Date();

const fecha = ahora.toLocaleDateString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo"
    }
);

    const hora = ahora.toLocaleTimeString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }
);
    const diferencia = total_efectivo - total_ventas;
    
    try {
        const result = await query(
            `INSERT INTO cuadres(fecha, hora, total_ventas, total_efectivo) VALUES ($1, $2, $3, $4) RETURNING id`,
            [fecha, hora, total_ventas, total_efectivo]
        );
        const cuadreID = result.rows[0].id;
        
        if (productos && productos.length > 0) {
            for (const prod of productos) {
                await query(`INSERT INTO productos_vendidos(cuadre_id, producto, precio) VALUES ($1, $2, $3)`,
                    [cuadreID, prod.nombre, prod.precio]);
            }
        }
        res.json({ mensaje: "Cuadre guardado correctamente", diferencia });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
});

app.get("/historial-cuadres", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM cuadres ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   VERIFICAR EMPLEADO
========================= */
app.post("/verificar-empleado", async (req, res) => {
    const { id, password } = req.body;
    try {
        const result = await query(`SELECT * FROM usuarios WHERE id = $1`, [id]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: "Empleado no encontrado" });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: "Contraseña incorrecta" });
        
        res.json({ mensaje: "Acceso correcto" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   CAMBIAR PASSWORD (para Fara)
========================= */
app.get("/cambiar-password", async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash("0008", 10);
        await query(`UPDATE usuarios SET password = $1 WHERE usuario = $2`, [hashedPassword, "Fara"]);
        res.send("Contraseña actualizada");
    } catch (error) {
        res.send(error.message);
    }
});

/* =========================
   DECOMISO
========================= */
app.post("/decomiso", async (req, res) => {
    const { producto, cantidad, motivo, responsable } = req.body;
    const ahora = new Date();

const fecha = ahora.toLocaleDateString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo"
    }
);

    const hora = ahora.toLocaleTimeString(
    "es-DO",
    {
        timeZone: "America/Santo_Domingo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }
);
    
    try {
        await query(
            `INSERT INTO decomiso(producto, cantidad, motivo, responsable, fecha, hora) VALUES ($1, $2, $3, $4, $5, $6)`,
            [producto, cantidad, motivo, responsable, fecha, hora]
        );
        res.json({ mensaje: "Decomiso registrado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/decomiso", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM decomiso ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================
   CREAR ADMIN (endpoint útil)
========================= */
app.get("/crear-admin", async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash("4321", 10);
        await query(
            `INSERT INTO usuarios(nombre, usuario, password, rol) VALUES ($1, $2, $3, $4)`,
            ["Administrador", "admin", hashedPassword, "admin"]
        );
        res.send("Administrador creado con exito");
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
    }
});

/* =========================
   SERVIDOR
========================= */
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT} con PostgreSQL`);
});



/* ===========================================================
   ÁREAS DE CLIENTES (NUEVO MÓDULO)
==============================================================*/

// Helper: verificar si el usuario es admin
const esAdmin = async (usuarioId) => {
    const result = await query(`SELECT rol FROM usuarios WHERE id = $1`, [usuarioId]);
    return result.rows[0]?.rol === 'admin';
};

// Obtener área de un cliente (GET /api/area-cliente/:id?)
app.get("/api/area-cliente/:id?", async (req, res) => {
    const { id: usuarioId, rol } = req.usuario; // Necesitamos middleware de auth
    const clienteId = req.params.id || usuarioId;
    
    // Si no es admin y pide ver otro cliente -> denegar
    if (rol !== 'admin' && parseInt(clienteId) !== usuarioId) {
        return res.status(403).json({ error: "No tienes permiso para ver esta área" });
    }
    
    try {
        // Verificar si el cliente existe
        const cliente = await query(`SELECT id, nombre, usuario, telefono FROM usuarios WHERE id = $1 AND rol = 'cliente'`, [clienteId]);
        if (cliente.rows.length === 0 && rol === 'admin') {
            return res.status(404).json({ error: "Cliente no encontrado" });
        }
        
        // Obtener o crear área por defecto
        let area = await query(`SELECT * FROM areas_clientes WHERE usuario_id = $1`, [clienteId]);
        
        if (area.rows.length === 0) {
            // Crear área vacía si no existe
            await query(
                `INSERT INTO areas_clientes(usuario_id, contenido) VALUES ($1, $2)`,
                [clienteId, JSON.stringify({})]
            );
            area = await query(`SELECT * FROM areas_clientes WHERE usuario_id = $1`, [clienteId]);
        }
        
        res.json({
            cliente: cliente.rows[0] || { id: clienteId, nombre: "Cliente" },
            area: area.rows[0]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Actualizar área de cliente (PUT /api/area-cliente/:id)
app.put("/api/area-cliente/:id", async (req, res) => {
    const { id: usuarioId, rol } = req.usuario;
    const clienteId = req.params.id;
    const { contenido } = req.body;
    
    // Validar permisos
    if (rol !== 'admin' && parseInt(clienteId) !== usuarioId) {
        return res.status(403).json({ error: "No tienes permiso para modificar esta área" });
    }
    
    // Si es cliente, solo puede modificar campos permitidos
    let contenidoFinal = contenido;
    if (rol !== 'admin') {
        // Cliente solo puede modificar ciertas secciones (ej: notas_personales)
        const areaActual = await query(`SELECT contenido FROM areas_clientes WHERE usuario_id = $1`, [clienteId]);
        const contenidoExistente = areaActual.rows[0]?.contenido || {};
        contenidoFinal = {
            ...contenidoExistente,
            notas_personales: contenido.notas_personales || contenido // si manda solo texto plano
        };
    }
    
    try {
        await query(
            `INSERT INTO areas_clientes(usuario_id, contenido, actualizado_por, actualizado_en)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (usuario_id) 
             DO UPDATE SET contenido = $2, actualizado_por = $3, actualizado_en = CURRENT_TIMESTAMP`,
            [clienteId, JSON.stringify(contenidoFinal), usuarioId]
        );
        
        res.json({ mensaje: "Área actualizada correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtener lista de clientes (solo admin)
app.get("/api/clientes", async (req, res) => {
    const { rol } = req.usuario;
    
    if (rol !== 'admin') {
        return res.status(403).json({ error: "Acceso denegado" });
    }
    
    try {
        const clientes = await query(`
            SELECT u.id, u.nombre, u.usuario, u.telefono, u.estado, 
                   a.contenido, a.actualizado_en
            FROM usuarios u
            LEFT JOIN areas_clientes a ON u.id = a.usuario_id
            WHERE u.rol = 'cliente'
            ORDER BY u.id DESC
        `);
        res.json(clientes.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});