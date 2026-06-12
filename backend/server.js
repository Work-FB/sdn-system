require('dotenv').config();

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// ============================================
// ENDPOINT PÚBLICO PARA EL MENÚ
// ============================================
app.get("/public/menus", async (req, res) => {
    try {
        // Reutiliza la misma consulta que ya funciona en /menus
        const result = await query(`
            SELECT 
                id, 
                nombre, 
                precio, 
                COALESCE(categoria, 'normales') as categoria,
                COALESCE(descripcion, 'Delicioso platillo de nuestra cocina') as descripcion,
                COALESCE(variantes, '["Normal"]') as variantes,
                imagen
            FROM menus 
            WHERE disponible = 1 
            ORDER BY id DESC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error("Error en /public/menus:", error);
        res.status(500).json({ error: error.message });
    }
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configuración de multer para imágenes
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ============================================
// CONEXIÓN A POSTGRESQL
// ============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const query = (text, params) => pool.query(text, params);

// ============================================
// FUNCIÓN PARA FORMATEAR FECHA/HORA
// ============================================
const getFechaHora = () => {
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo" });
    const hora = ahora.toLocaleTimeString("es-DO", { 
        timeZone: "America/Santo_Domingo", 
        hour: "2-digit", 
        minute: "2-digit", 
        second: "2-digit" 
    });
    return { fecha, hora };
};

// ============================================
// MIDDLEWARE DE AUTENTICACIÓN
// ============================================
const autenticar = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "Token no proporcionado" });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: "Token inválido" });
    }
    
    try {
        const result = await query(`SELECT id, nombre, rol FROM usuarios WHERE id = $1`, [token]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Usuario no encontrado" });
        }
        
        req.usuario = result.rows[0];
        next();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const verificarAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "Se requiere autenticación" });
    }
    
    const token = authHeader.split(' ')[1];
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

// ============================================
// ENDPOINTS PARA RECIBIR PEDIDOS
// ============================================

// Guardar pedido completo en la base de datos
app.post("/api/guardar-pedido", async (req, res) => {
    const { cliente, telefono, direccion, metodoPago, total, productos, fecha } = req.body;
    
    try {
        // Crear tabla de pedidos si no existe
        await query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                numero_pedido TEXT NOT NULL,
                cliente TEXT NOT NULL,
                telefono TEXT,
                direccion TEXT NOT NULL,
                metodo_pago TEXT NOT NULL,
                total REAL NOT NULL,
                productos JSONB NOT NULL,
                estado TEXT DEFAULT 'pendiente',
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL,
                leido BOOLEAN DEFAULT FALSE
            )
        `);
        
        const ahora = new Date();
        const fechaActual = ahora.toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo" });
        const horaActual = ahora.toLocaleTimeString("es-DO", { timeZone: "America/Santo_Domingo", hour: "2-digit", minute: "2-digit" });
        
        const result = await query(
            `INSERT INTO pedidos (numero_pedido, cliente, telefono, direccion, metodo_pago, total, productos, fecha, hora)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [Date.now().toString(), cliente, telefono, direccion, metodoPago, total, JSON.stringify(productos), fechaActual, horaActual]
        );
        
        res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error("Error guardando pedido:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener pedidos pendientes (para el admin)
app.get("/admin/pedidos-pendientes", verificarAdmin, async (req, res) => {
    try {
        const result = await query(`
            SELECT * FROM pedidos 
            WHERE leido = FALSE 
            ORDER BY id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Marcar pedido como leído
app.put("/admin/pedido-leido/:id", verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await query(`UPDATE pedidos SET leido = TRUE WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// INICIALIZAR TABLAS
// ============================================
const initDB = async () => {
    try {
        await query(`CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            usuario TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            rol TEXT NOT NULL,
            telefono TEXT,
            salario REAL,
            estado TEXT DEFAULT 'Activo',
            fecha_ingreso TEXT
        )`);

        await query(`CREATE TABLE IF NOT EXISTS menus (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            precio REAL NOT NULL,
            categoria TEXT DEFAULT 'normales',
            descripcion TEXT,
            variantes TEXT DEFAULT '["Normal"]',
            imagen TEXT,
            disponible INTEGER DEFAULT 1
        )`);

        await query(`CREATE TABLE IF NOT EXISTS ventas (
            id SERIAL PRIMARY KEY,
            producto TEXT NOT NULL,
            cantidad INTEGER NOT NULL,
            precio REAL NOT NULL,
            total REAL NOT NULL,
            fecha TEXT NOT NULL,
            hora TEXT NOT NULL
        )`);

        await query(`CREATE TABLE IF NOT EXISTS areas_clientes (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
            contenido JSONB DEFAULT '{}',
            actualizado_por INTEGER REFERENCES usuarios(id),
            actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(usuario_id)
        )`);

        await query(`CREATE TABLE IF NOT EXISTS gastos (
            id SERIAL PRIMARY KEY,
            descripcion TEXT NOT NULL,
            monto REAL NOT NULL,
            fecha TEXT NOT NULL,
            hora TEXT NOT NULL
        )`);

        await query(`CREATE TABLE IF NOT EXISTS productos (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            categoria TEXT,
            stock INTEGER DEFAULT 0,
            costo REAL DEFAULT 0,
            suplidor TEXT,
            imagen TEXT,
            fecha TEXT
        )`);

        await query(`CREATE TABLE IF NOT EXISTS cuadres (
            id SERIAL PRIMARY KEY,
            fecha TEXT NOT NULL,
            hora TEXT NOT NULL,
            total_ventas REAL NOT NULL,
            total_efectivo REAL NOT NULL
        )`);

        await query(`CREATE TABLE IF NOT EXISTS caja (
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
        )`);

        console.log("✅ Tablas creadas/verificadas");
    } catch (err) {
        console.error("❌ Error creando tablas:", err);
    }
};
initDB();

// ============================================
// 1. ENDPOINTS PÚBLICOS
// ============================================

app.get("/public/menus", async (req, res) => {
    try {
        const result = await query(`
            SELECT id, nombre, precio, categoria, 
                   COALESCE(descripcion, 'Delicioso platillo de nuestra cocina') as descripcion,
                   COALESCE(variantes, '["Normal"]') as variantes,
                   imagen 
            FROM menus 
            WHERE disponible = 1 
            ORDER BY id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Error en /public/menus:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post("/public/venta-rapida", async (req, res) => {
    const { producto, cantidad, precio } = req.body;
    const total = cantidad * precio;
    const { fecha, hora } = getFechaHora();
    
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

app.post("/verify-admin-access", async (req, res) => {
    const { password } = req.body;
    const SECRET_KEY = process.env.ADMIN_ACCESS_PASSWORD || '4321';
    
    if (password === SECRET_KEY) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Endpoint público para el menú (usa tus productos existentes)
app.get("/public/menus", async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                id, 
                nombre, 
                precio, 
                COALESCE(categoria, 'normales') as categoria,
                COALESCE(descripcion, 'Delicioso platillo de nuestra cocina') as descripcion,
                COALESCE(variantes, '["Normal"]') as variantes,
                imagen,
                disponible
            FROM menus 
            WHERE disponible = 1 
            ORDER BY id DESC
        `);
        
        if (result.rows.length === 0) {
            // Si no hay productos, devolver mensaje claro
            return res.json([]);
        }
        
        res.json(result.rows);
    } catch (error) {
        console.error("Error en /public/menus:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PEDIDOS - NUEVOS ENDPOINTS
// ============================================

// Guardar pedido en la base de datos (esto ya lo tienes)
app.post("/api/guardar-pedido", async (req, res) => {
    const { cliente, telefono, direccion, metodoPago, total, productos, numeroPedido } = req.body;
    
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                numero_pedido TEXT NOT NULL,
                cliente TEXT NOT NULL,
                telefono TEXT,
                direccion TEXT NOT NULL,
                metodo_pago TEXT NOT NULL,
                total REAL NOT NULL,
                productos JSONB NOT NULL,
                estado TEXT DEFAULT 'pendiente',
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await query(
            `INSERT INTO pedidos (numero_pedido, cliente, telefono, direccion, metodo_pago, total, productos)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [numeroPedido, cliente, telefono, direccion, metodoPago, total, JSON.stringify(productos)]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtener historial de un cliente (por teléfono o nombre)
app.post("/api/mis-pedidos", async (req, res) => {
    const { telefono, nombre } = req.body;
    
    try {
        const result = await query(
            `SELECT * FROM pedidos WHERE telefono = $1 OR cliente = $2 ORDER BY fecha DESC LIMIT 20`,
            [telefono, nombre]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ENVÍO DE WHATSAPP (WhatsApp Business API)
// ============================================

const axios = require('axios'); // Asegúrate de tener axios instalado: npm install axios

app.post("/api/enviar-whatsapp", async (req, res) => {
    const { telefono, mensaje } = req.body;
    
    // Variables de entorno (configúralas en Render)
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
    
    // Si no está configurado, usa el método de enlace directo
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
        // Fallback: devolver la URL para abrir WhatsApp
        return res.json({ 
            success: true, 
            method: 'fallback',
            url: `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`
        });
    }
    
    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: 'whatsapp',
                to: telefono,
                type: 'text',
                text: { body: mensaje }
            }
        });
        res.json({ success: true, method: 'api' });
    } catch (error) {
        console.error('Error enviando WhatsApp:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 2. ENDPOINTS DE AUTENTICACIÓN
// ============================================

app.post("/login", async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const result = await query(`SELECT * FROM usuarios WHERE usuario = $1`, [usuario]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: "Contraseña incorrecta" });
        
        res.json({
            mensaje: "Login correcto",
            usuario: { id: user.id, nombre: user.nombre, rol: user.rol },
            token: user.id.toString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ============================================
// PEDIDOS Y FACTURAS - ENDPOINTS COMPLETOS
// ============================================

// Crear tabla de pedidos si no existe
const crearTablaPedidos = async () => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                numero_pedido TEXT NOT NULL,
                cliente_nombre TEXT NOT NULL,
                cliente_telefono TEXT,
                cliente_direccion TEXT NOT NULL,
                metodo_pago TEXT NOT NULL,
                total REAL NOT NULL,
                productos JSONB NOT NULL,
                estado TEXT DEFAULT 'pendiente',
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL,
                leido BOOLEAN DEFAULT FALSE
            )
        `);
        console.log("✅ Tabla pedidos verificada");
    } catch (error) {
        console.error("Error creando tabla pedidos:", error);
    }
};
crearTablaPedidos();

// Guardar pedido (desde el frontend)
app.post("/api/guardar-pedido", async (req, res) => {
    const { 
        numero_pedido, 
        cliente_nombre, 
        cliente_telefono, 
        cliente_direccion, 
        metodo_pago, 
        total, 
        productos,
        fecha,
        hora 
    } = req.body;
    
    try {
        await query(
            `INSERT INTO pedidos (numero_pedido, cliente_nombre, cliente_telefono, cliente_direccion, 
             metodo_pago, total, productos, fecha, hora, estado)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [numero_pedido, cliente_nombre, cliente_telefono, cliente_direccion, 
             metodo_pago, total, JSON.stringify(productos), fecha, hora, 'pendiente']
        );
        res.json({ success: true, mensaje: "Pedido guardado" });
    } catch (error) {
        console.error("Error guardando pedido:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener TODOS los pedidos (para admin)
app.get("/admin/pedidos", verificarAdmin, async (req, res) => {
    try {
        const result = await query(`
            SELECT * FROM pedidos 
            ORDER BY id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Error obteniendo pedidos:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener pedidos pendientes (admin)
app.get("/admin/pedidos-pendientes", verificarAdmin, async (req, res) => {
    try {
        const result = await query(`
            SELECT * FROM pedidos 
            WHERE estado = 'pendiente' 
            ORDER BY id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar estado del pedido
app.put("/admin/pedidos/:id/estado", verificarAdmin, async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;
    
    try {
        await query(`UPDATE pedidos SET estado = $1 WHERE id = $2`, [estado, id]);
        res.json({ success: true });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Marcar pedido como leído
app.put("/admin/pedido-leido/:id", verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await query(`UPDATE pedidos SET leido = TRUE WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener factura por ID
app.get("/api/factura/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query(`SELECT * FROM pedidos WHERE id = $1 OR numero_pedido = $1`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Factura no encontrada" });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
});

const nodemailer = require('nodemailer');

// Configurar transporter (usando Gmail como ejemplo)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,  // Tu correo
        pass: process.env.EMAIL_PASS   // Contraseña de aplicación
    }
});

app.post("/api/enviar-pedido-email", async (req, res) => {
    const { cliente, telefono, direccion, metodoPago, total, productos, numeroPedido } = req.body;
    
    // Crear HTML del correo
    let productosHTML = '';
    productos.forEach(item => {
        productosHTML += `
            <tr>
                <td>${item.nombre}</td>
                <td>${item.cantidad}</td>
                <td>$${item.precio}</td>
                <td>$${item.precio * item.cantidad}</td>
            </tr>
        `;
    });
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: 'negocio@sdn.com', // Cambia por el email del negocio
        subject: `📦 NUEVO PEDIDO #${numeroPedido} - SDN Sazón Doña Nelta`,
        html: `
            <h2>🍽️ Nuevo Pedido Recibido</h2>
            <p><strong>Pedido #:</strong> ${numeroPedido}</p>
            <p><strong>Cliente:</strong> ${cliente}</p>
            <p><strong>Teléfono:</strong> ${telefono || 'No especificado'}</p>
            <p><strong>Dirección:</strong> ${direccion}</p>
            <p><strong>Método de pago:</strong> ${metodoPago}</p>
            
            <h3>📋 Productos:</h3>
            <table border="1" cellpadding="5">
                <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Precio unitario</th>
                    <th>Subtotal</th>
                </tr>
                ${productosHTML}
                <tr>
                    <td colspan="3"><strong>TOTAL</strong></td>
                    <td><strong>$${total}</strong></td>
                </tr>
            </table>
            
            <p style="margin-top:20px;">🙏 ¡Atender este pedido lo antes posible!</p>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (error) {
        console.error("Error enviando email:", error);
        res.status(500).json({ error: error.message });
    }
});

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

// ============================================
// 3. ENDPOINTS ADMIN (protegidos)
// ============================================

app.get("/admin/clientes", verificarAdmin, async (req, res) => {
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

app.put("/admin/area-cliente/:id", verificarAdmin, async (req, res) => {
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

app.get("/empleados-completo", verificarAdmin, async (req, res) => {
    try {
        const result = await query(`SELECT * FROM usuarios ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/crear-empleado", verificarAdmin, async (req, res) => {
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

app.delete("/eliminar-empleado/:id", verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await query(`DELETE FROM usuarios WHERE id = $1`, [id]);
        res.json({ mensaje: "Empleado eliminado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 4. ENDPOINTS DE ÁREAS (protegidos por autenticación)
// ============================================

app.get("/api/area-cliente/:id?", autenticar, async (req, res) => {
    const { id: usuarioId, rol } = req.usuario;
    const clienteId = req.params.id || usuarioId;
    
    if (rol !== 'admin' && parseInt(clienteId) !== usuarioId) {
        return res.status(403).json({ error: "No tienes permiso" });
    }
    
    try {
        let area = await query(`SELECT * FROM areas_clientes WHERE usuario_id = $1`, [clienteId]);
        
        if (area.rows.length === 0) {
            await query(`INSERT INTO areas_clientes(usuario_id, contenido) VALUES ($1, $2)`, [clienteId, JSON.stringify({})]);
            area = await query(`SELECT * FROM areas_clientes WHERE usuario_id = $1`, [clienteId]);
        }
        
        res.json({ area: area.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 5. ENDPOINTS DE GESTIÓN (menús, productos, etc.)
// ============================================

app.get("/menus", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM menus ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/crear-menu", upload.single("imagen"), async (req, res) => {
    const { nombre, precio, categoria, descripcion, variantes } = req.body;
    const imagen = req.file ? req.file.filename : null;
    
    try {
        await query(
            `INSERT INTO menus(nombre, precio, categoria, descripcion, variantes, imagen) VALUES ($1, $2, $3, $4, $5, $6)`,
            [nombre, precio, categoria || 'normales', descripcion || '', variantes || '["Normal"]', imagen]
        );
        res.json({ mensaje: "Producto agregado" });
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

// ============================================
// 6. ENDPOINTS DE VENTAS, GASTOS, REPORTES
// ============================================

app.get("/ventas", async (req, res) => {
    try {
        const result = await query(`SELECT * FROM ventas ORDER BY id DESC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/crear-gasto", async (req, res) => {
    const { descripcion, monto } = req.body;
    const { fecha, hora } = getFechaHora();
    
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

app.get("/reporte-final", async (req, res) => {
    try {
        const ventas = await query(`SELECT COALESCE(SUM(total), 0) as totalVentas FROM ventas`);
        const gastos = await query(`SELECT COALESCE(SUM(monto), 0) as totalGastos FROM gastos`);
        
        const totalVentas = parseFloat(ventas.rows[0].totalventas);
        const totalGastos = parseFloat(gastos.rows[0].totalgastos);
        const totalFinal = totalVentas - totalGastos;
        
        res.json({ totalVentas, totalGastos, totalFinal });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 7. ENDPOINTS ÚTILES (admin, utilidades)
// ============================================

app.get("/crear-admin", async (req, res) => {
    try {
        const exists = await query(`SELECT * FROM usuarios WHERE usuario = 'admin'`);
        if (exists.rows.length > 0) {
            return res.send("El administrador ya existe");
        }
        
        const hashedPassword = await bcrypt.hash("4321", 10);
        await query(
            `INSERT INTO usuarios(nombre, usuario, password, rol) VALUES ($1, $2, $3, $4)`,
            ["Administrador", "admin", hashedPassword, "admin"]
        );
        res.send("Administrador creado con éxito");
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});