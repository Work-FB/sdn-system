/*==========================================================
    Variables principales
============================================================*/

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
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

app.use(
    "/uploads",
    express.static(
        path.join(__dirname, "uploads")
    )
);

const storage = multer.diskStorage({

    destination: function(req, file, cb){

        cb(null, "uploads/");

    },

    filename: function(req, file, cb){

        cb(
            null,
            Date.now() +
            path.extname(file.originalname)
        );

    }

});

const upload = multer({
    storage
});


/*======================================================
    BASE DE DATOS
========================================================*/

const db = new sqlite3.Database("./database.db", (err) => {
    if (err) {
        console.log("Error conectando SQLite", err.message);
    }
    else {
        console.log("SQLite conectado");
    }
});

/*Creación de las tablas necesarias*/

// Usuario, para entrar al sistema
db.run(`
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    rol TEXT NOT NULL
)
`);

//Cuadres de la tabla de control de ventas
db.run(`
CREATE TABLE IF NOT EXISTS cuadres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    total_ventas REAL NOT NULL,
    total_efectivo REAL NOT NULL

)
`);

// Gastos del apartado Control de ventas
db.run(`
CREATE TABLE IF NOT EXISTS gastos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descripcion TEXT NOT NULL,
    monto REAL NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL

)
`);
//Esta tabla es del apartado de control de ventas
db.run(`
CREATE TABLE IF NOT EXISTS productos_vendidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cuadre_id INTEGER,
    producto TEXT NOT NULL,
    precio REAL NOT NULL,

    FOREIGN KEY(cuadre_id)
    REFERENCES cuadres(id)
)
`);

// Asistencia del apartado de control de asistencia
db.run(`
CREATE TABLE IF NOT EXISTS asistencia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,

    FOREIGN KEY(usuario_id)
    REFERENCES usuarios(id)
)
`);

//Del apartado del menu
db.run(`
CREATE TABLE IF NOT EXISTS menus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    categoria TEXT,
    imagen TEXT,
    disponible INTEGER DEFAULT 1
)
`);

//Del apartado de productos
db.run(`
CREATE TABLE IF NOT EXISTS productos (

    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    categoria TEXT,
    stock INTEGER DEFAULT 0,
    costo REAL DEFAULT 0,
    suplidor TEXT,
    imagen TEXT,
    fecha TEXT

)
`);

//Perteneciente al espacio de Inventario
db.run(`
CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    detalle TEXT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,

    FOREIGN KEY(producto_id)
    REFERENCES productos(id)

)
`);

//Parte del apartado de control de ventas
db.run(`
CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    precio REAL NOT NULL,
    total REAL NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL

)
`);
    
db.run(`
CREATE TABLE IF NOT EXISTS depositos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente TEXT NOT NULL,
    monto REAL NOT NULL,
    banco TEXT,
    referencia TEXT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL

)
`);

db.run(`
CREATE TABLE IF NOT EXISTS dolares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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

//Caja
db.run(`
CREATE TABLE IF NOT EXISTS caja (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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

//Decomiso
db.run(`
CREATE TABLE IF NOT EXISTS decomiso (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    motivo TEXT NOT NULL,
    responsable TEXT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL

)
`);
/* =========================
   REGISTRO
========================= */

app.post("/register", async (req, res) => {

    const { nombre, usuario, password, rol } = req.body;

    try {

        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            `
            INSERT INTO usuarios(nombre, usuario, password, rol)
            VALUES (?, ?, ?, ?)
            `,
            [nombre, usuario, hashedPassword, rol],
            function(err) {

                if (err) {
                    return res.status(400).json({
                        error: err.message
                    });
                }

                res.json({
                    mensaje: "Usuario registrado",
                    id: this.lastID
                });

            }
        );

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});

/*=============================
    Registro de empleados
===============================*/
app.post("/crear-empleado", async (req, res) => {

    const {

        nombre,
        usuario,
        password,
        rol,
        telefono,
        salario

    } = req.body;

    try{

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const fechaIngreso =
            new Date().toLocaleDateString();

        db.run(
            `
            INSERT INTO usuarios(

                nombre,
                usuario,
                password,
                rol,
                telefono,
                salario,
                estado,
                fecha_ingreso

            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [

                nombre,
                usuario,
                hashedPassword,
                rol,
                telefono,
                salario,
                "Activo",
                fechaIngreso

            ],
            function(err){

                if(err){

                    return res.status(500).json({
                        error: err.message
                    });

                }

                res.json({
                    mensaje:
                    "Empleado creado"
                });

            }
        );

    }catch(error){

        res.status(500).json({
            error:error.message
        });

    }

});

app.get("/empleados-completo", (req, res) => {

    db.all(
        `
        SELECT *
        FROM usuarios
        ORDER BY id DESC
        `,
        [],
        (err, rows) => {

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json(rows);

        }
    );

});

app.delete("/eliminar-empleado/:id", (req, res) => {

    const { id } = req.params;

    db.run(
        `
        DELETE FROM usuarios
        WHERE id = ?
        `,
        [id],
        function(err){

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json({
                mensaje:
                "Empleado eliminado"
            });

        }
    );

});

/* =========================
   LOGIN
========================= */

app.post("/login", (req, res) => {

    const { usuario, password } = req.body;

    db.get(
        `
        SELECT * FROM usuarios
        WHERE usuario = ?
        `,
        [usuario],
        async (err, user) => {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            if (!user) {
                return res.status(404).json({
                    error: "Usuario no encontrado"
                });
            }

            const validPassword = await bcrypt.compare(
                password,
                user.password
            );

            if (!validPassword) {
                return res.status(401).json({
                    error: "Contraseña incorrecta"
                });
            }

            res.json({
                mensaje: "Login correcto",
                usuario: {
                    id: user.id,
                    nombre: user.nombre,
                    rol: user.rol
                }
            });

        }
    );

});

/*===========================================================================
    Apartado de control de ventas
=============================================================================*/

app.post("/crear-venta", (req, res) => {

    const {
        producto,
        cantidad,
        precio
    } = req.body;

    const total =
        cantidad * precio;

    const fecha =
        new Date().toLocaleDateString();

    const hora =
        new Date().toLocaleTimeString();

    db.run(
        `
        INSERT INTO ventas(
            producto,
            cantidad,
            precio,
            total,
            fecha,
            hora
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            producto,
            cantidad,
            precio,
            total,
            fecha,
            hora
        ],
        function(err){

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json({
                mensaje:"Venta registrada",
                total
            });

        }
    );

});

app.get("/ventas", (req, res) => {

    db.all(
        `
        SELECT *
        FROM ventas
        ORDER BY id DESC
        `,
        [],
        (err, rows) => {

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json(rows);

        }
    );

});


app.post("/crear-gasto", (req, res) => {

    const {
        descripcion,
        monto
    } = req.body;

    const fecha =
        new Date().toLocaleDateString();

    const hora =
        new Date().toLocaleTimeString();

    db.run(
        `
        INSERT INTO gastos(
            descripcion,
            monto,
            fecha,
            hora
        )
        VALUES (?, ?, ?, ?)
        `,
        [
            descripcion,
            monto,
            fecha,
            hora
        ],
        function(err){

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json({
                mensaje:"Gasto registrado"
            });

        }
    );

});

app.get("/gastos", (req, res) => {

    db.all(
        `
        SELECT *
        FROM gastos
        ORDER BY id DESC
        `,
        [],
        (err, rows) => {

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json(rows);

        }
    );

});

app.post("/crear-deposito", (req, res) => {

    const {
        cliente,
        monto,
        banco,
        referencia
    } = req.body;

    const fecha =
        new Date().toLocaleDateString();

    const hora =
        new Date().toLocaleTimeString();

    db.run(
        `
        INSERT INTO depositos(
            cliente,
            monto,
            banco,
            referencia,
            fecha,
            hora
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            cliente,
            monto,
            banco,
            referencia,
            fecha,
            hora
        ],
        function(err){

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json({
                mensaje:"Depósito registrado"
            });

        }
    );

});

app.get("/depositos", (req, res) => {

    db.all(
        `
        SELECT *
        FROM depositos
        ORDER BY id DESC
        `,
        [],
        (err, rows) => {

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json(rows);

        }
    );

});

//-------------------------------------------------

app.post("/guardar-dolares", (req, res) => {

    const {
        uno,
        dos,
        cinco,
        diez,
        veinte,
        cincuenta,
        cien,
        tasa
    } = req.body;

    const totalUSD =

        (uno * 1) +
        (dos * 2) +
        (cinco * 5) +
        (diez * 10) +
        (veinte * 20) +
        (cincuenta * 50) +
        (cien * 100);

    const totalDOP =
        totalUSD * tasa;

    const fecha =
        new Date().toLocaleDateString();

    const hora =
        new Date().toLocaleTimeString();

    db.run(
        `
        INSERT INTO dolares(

            uno,
            dos,
            cinco,
            diez,
            veinte,
            cincuenta,
            cien,

            tasa,

            total_usd,
            total_dop,

            fecha,
            hora

        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [

            uno,
            dos,
            cinco,
            diez,
            veinte,
            cincuenta,
            cien,

            tasa,

            totalUSD,
            totalDOP,

            fecha,
            hora

        ],
        function(err){

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json({

                mensaje:
                "Dólares registrados",

                totalUSD,
                totalDOP

            });

        }
    );

});

//----------------------------------------

app.get("/dolares", (req, res) => {

    db.all(
        `
        SELECT *
        FROM dolares
        ORDER BY id DESC
        `,
        [],
        (err, rows) => {

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json(rows);

        }
    );

});
//______________________________________________________________________

app.get("/reporte-final", (req, res) => {

    /* =========================
       VENTAS
    ========================= */

    db.get(
        `
        SELECT SUM(total) AS totalVentas
        FROM ventas
        `,
        [],
        (err, ventas) => {

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            /* =========================
               GASTOS
            ========================= */

            db.get(
                `
                SELECT SUM(monto) AS totalGastos
                FROM gastos
                `,
                [],
                (err, gastos) => {

                    if(err){

                        return res.status(500).json({
                            error: err.message
                        });

                    }

                    /* =========================
                       DEPOSITOS
                    ========================= */

                    db.get(
                        `
                        SELECT SUM(monto) AS totalDepositos
                        FROM depositos
                        `,
                        [],
                        (err, depositos) => {

                            if(err){

                                return res.status(500).json({
                                    error: err.message
                                });

                            }

                            /* =========================
                               DOLARES
                            ========================= */

                            db.get(
                                `
                                SELECT SUM(total_dop)
                                AS totalDolares
                                FROM dolares
                                `,
                                [],
                                (err, dolares) => {

                                    if(err){

                                        return res.status(500).json({
                                            error: err.message
                                        });

                                    }

                                    const totalVentas =
                                        ventas.totalVentas || 0;

                                    const totalGastos =
                                        gastos.totalGastos || 0;

                                    const totalDepositos =
                                        depositos.totalDepositos || 0;

                                    const totalDolares =
                                        dolares.totalDolares || 0;

                                    const totalFinal =

                                        totalVentas
                                        - totalGastos
                                        + totalDepositos
                                        + totalDolares;

                                    res.json({

                                        totalVentas,

                                        totalGastos,

                                        totalDepositos,

                                        totalDolares,

                                        totalFinal

                                    });

                                }
                            );

                        }
                    );

                }
            );

        }
    );

});


/*================================================================
    Caja 
==================================================================*/

app.post("/guardar-caja", (req, res) => {

    const {

        total_ventas,
        total_gastos,
        total_depositos,
        total_dolares,
        total_final,
        faltante,
        estado,
        observacion

    } = req.body;

    const fecha =
        new Date().toLocaleDateString();

    const hora =
        new Date().toLocaleTimeString();

    db.run(
        `
        INSERT INTO caja (

            fecha,
            hora,

            total_ventas,
            total_gastos,
            total_depositos,
            total_dolares,
            total_final,

            faltante,

            estado,
            observacion

        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [

            fecha,
            hora,

            total_ventas,
            total_gastos,
            total_depositos,
            total_dolares,
            total_final,

            faltante,

            estado,
            observacion

        ],
        function(err){

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json({
                mensaje:
                "Caja guardada correctamente"
            });

        }
    );

});

app.get("/caja", (req, res) => {

    db.all(
        `
        SELECT *
        FROM caja
        ORDER BY id DESC
        `,
        [],
        (err, rows) => {

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json(rows);

        }
    );

});

/*================================================================
    Inventario
==================================================================*/

app.post(
    "/crear-movimiento",
    (req, res) => {

        const {
            producto_id,
            tipo,
            cantidad,
            detalle
        } = req.body;

        const fecha =
            new Date().toLocaleDateString();

        const hora =
            new Date().toLocaleTimeString();

        /* =========================
           OBTENER STOCK ACTUAL
        ========================= */

        db.get(
            `
            SELECT stock
            FROM productos
            WHERE id = ?
            `,
            [producto_id],
            (err, producto) => {

                if(err){

                    return res.status(500).json({
                        error: err.message
                    });

                }

                if(!producto){

                    return res.status(404).json({
                        error:"Producto no encontrado"
                    });

                }

                let nuevoStock =
                    producto.stock;

                /* =========================
                   CALCULAR STOCK
                ========================= */

                if(tipo === "ENTRADA"){

                    nuevoStock +=
                        parseInt(cantidad);

                }

                if(tipo === "SALIDA"){

                    nuevoStock -=
                        parseInt(cantidad);

                    if(nuevoStock < 0){

                        nuevoStock = 0;

                    }

                }

                /* =========================
                   ACTUALIZAR PRODUCTO
                ========================= */

                db.run(
                    `
                    UPDATE productos
                    SET stock = ?
                    WHERE id = ?
                    `,
                    [
                        nuevoStock,
                        producto_id
                    ],
                    function(err){

                        if(err){

                            return res.status(500).json({
                                error: err.message
                            });

                        }

                        /* =========================
                           GUARDAR MOVIMIENTO
                        ========================= */

                        db.run(
                            `
                            INSERT INTO movimientos(
                                producto_id,
                                tipo,
                                cantidad,
                                detalle,
                                fecha,
                                hora
                            )
                            VALUES (?, ?, ?, ?, ?, ?)
                            `,
                            [
                                producto_id,
                                tipo,
                                cantidad,
                                detalle,
                                fecha,
                                hora
                            ],
                            function(err){

                                if(err){

                                    return res.status(500).json({
                                        error: err.message
                                    });

                                }

                                res.json({

                                    mensaje:
                                    "Movimiento registrado",

                                    stock:nuevoStock

                                });

                            }
                        );

                    }
                );

            }
        );

    }
);


app.get(
    "/movimientos",
    (req, res) => {

        db.all(
            `
            SELECT
                movimientos.*,
                productos.nombre
            FROM movimientos

            INNER JOIN productos
            ON productos.id =
            movimientos.producto_id

            ORDER BY movimientos.id DESC
            `,
            [],
            (err, rows) => {

                if(err){

                    return res.status(500).json({
                        error: err.message
                    });

                }

                res.json(rows);

            }
        );

    }
);


/*======================================================================
    Menu
========================================================================*/
app.post(
    "/crear-menu",
    upload.single("imagen"),
    (req, res) => {

        const {
            nombre,
            precio,
            categoria
        } = req.body;

        const imagen = req.file
            ? req.file.filename
            : null;

        db.run(
            `
            INSERT INTO menus(
                nombre,
                precio,
                categoria,
                imagen
            )
            VALUES (?, ?, ?, ?)
            `,
            [
                nombre,
                precio,
                categoria,
                imagen
            ],
            function(err){

                if(err){

                    return res.status(500).json({
                        error: err.message
                    });

                }

                res.json({
                    mensaje:"Producto agregado"
                });

            }
        );

    }
);

app.get("/menus", (req, res) => {

    db.all(
        `
        SELECT *
        FROM menus
        ORDER BY id DESC
        `,
        [],
        (err, rows) => {

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json(rows);

        }
    );

});

app.delete("/eliminar-menu/:id", (req, res) => {

    const id = req.params.id;

    db.run(
        `
        DELETE FROM menus
        WHERE id = ?
        `,
        [id],
        function(err){

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json({
                mensaje:"Producto eliminado"
            });

        }
    );

});



app.post(
    "/crear-producto",
    upload.single("imagen"),
    (req, res) => {

        const {
            nombre,
            categoria,
            stock,
            costo,
            suplidor
        } = req.body;

        const imagen = req.file
            ? req.file.filename
            : null;

        const fecha =
            new Date().toLocaleDateString();

        db.run(
            `
            INSERT INTO productos(
                nombre,
                categoria,
                stock,
                costo,
                suplidor,
                imagen,
                fecha
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                nombre,
                categoria,
                stock,
                costo,
                suplidor,
                imagen,
                fecha
            ],
            function(err){

                if(err){

                    return res.status(500).json({
                        error: err.message
                    });

                }

                res.json({
                    mensaje:"Producto agregado"
                });

            }
        );

    }
);

app.get("/productos", (req, res) => {

    db.all(
        `
        SELECT * FROM productos
        ORDER BY id DESC
        `,
        [],
        (err, rows) => {

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json(rows);

        }
    );

});

app.delete(
    "/eliminar-producto/:id",
    (req, res) => {

        const { id } = req.params;

        db.run(
            `
            DELETE FROM productos
            WHERE id = ?
            `,
            [id],
            function(err){

                if(err){

                    return res.status(500).json({
                        error: err.message
                    });

                }

                res.json({
                    mensaje:"Producto eliminado"
                });

            }
        );

    }
);


//NUEVO
app.get("/empleados", (req, res) => {

    db.all(
        `
        SELECT id, nombre
        FROM usuarios
        `,
        [],
        (err, rows) => {

            if(err){
                return res.status(500).json({
                    error: err.message
                });
            }

            res.json(rows);

        }
    );

});

//NUEVO
app.post("/asistencia", (req, res) => {

    const { usuario_id, tipo } = req.body;

    const fecha = new Date().toLocaleDateString();
    const hora = new Date().toLocaleTimeString();

    db.run(
        `
        INSERT INTO asistencia(
            usuario_id,
            tipo,
            fecha,
            hora
        )
        VALUES (?, ?, ?, ?)
        `,
        [
            usuario_id,
            tipo,
            fecha,
            hora
        ],
        function(err){

            if(err){
                return res.status(500).json({
                    error: err.message
                });
            }

            res.json({
                mensaje: `${tipo} registrada con éxito`,
                fecha,
                hora
            });

        }
    );

});

/*=====================================================
    Control de ventas V1
=======================================================*/
app.post("/guardar-cuadre", (req, res) => {

    const {
        total_ventas,
        total_efectivo,
        productos
    } = req.body;

    const fecha =
        new Date().toLocaleDateString();

    const hora =
        new Date().toLocaleTimeString();

    const diferencia =
        total_efectivo - total_ventas;

    db.run(
        `
        INSERT INTO cuadres(
            fecha,
            hora,
            total_ventas,
            total_efectivo
        )
        VALUES (?, ?, ?, ?)
        `,
        [
            fecha,
            hora,
            total_ventas,
            total_efectivo
        ],
        function(err){

            if(err){

                console.log(err);

                return res.status(500).json({
                    error: err.message
                });

            }

            const cuadreID = this.lastID;

            if(
                productos &&
                productos.length > 0
            ){

                productos.forEach(prod => {

                    db.run(
                        `
                        INSERT INTO productos_vendidos(
                            cuadre_id,
                            producto,
                            precio
                        )
                        VALUES (?, ?, ?)
                        `,
                        [
                            cuadreID,
                            prod.nombre,
                            prod.precio
                        ]
                    );

                });

            }

            return res.json({

                mensaje:
                    "Cuadre guardado correctamente",

                diferencia:
                    diferencia

            });

        }

    );

});

app.get("/historial-cuadres", (req, res) => {

    db.all(
        `
        SELECT *
        FROM cuadres
        ORDER BY id DESC
        `,
        [],
        (err, rows) => {

            if(err){
                return res.status(500).json({
                    error: err.message
                });
            }

            res.json(rows);

        }
    );

});


app.post("/verificar-empleado", (req, res) => {

    const { id, password } = req.body;

    db.get(
        `
        SELECT * FROM usuarios
        WHERE id = ?
        `,
        [id],
        async (err, user) => {

            if(err){
                return res.status(500).json({
                    error: err.message
                });
            }

            if(!user){
                return res.status(404).json({
                    error: "Empleado no encontrado"
                });
            }

            const validPassword = await bcrypt.compare(
                password,
                user.password
            );

            if(!validPassword){
                return res.status(401).json({
                    error: "Contraseña incorrecta"
                });
            }

            res.json({
                mensaje: "Acceso correcto"
            });

        }
    );

});


app.get("/cambiar-password", async (req, res) => {

    try {

        const hashedPassword =
            await bcrypt.hash("0008", 10);

        db.run(
            `
            UPDATE usuarios
            SET password = ?
            WHERE usuario = ?
            `,
            [
                hashedPassword,
                "Fara"
            ],
            function(err){

                if(err){
                    return res.send(err.message);
                }

                res.send(
                    "Contraseña actualizada"
                );

            }
        );

    } catch(error){

        res.send(error.message);

    }

});

/*=======================================================
    Decomiso
=========================================================*/

app.post("/decomiso", (req, res) => {

    const {

        producto,
        cantidad,
        motivo,
        responsable

    } = req.body;

    const fecha =
        new Date().toLocaleDateString();

    const hora =
        new Date().toLocaleTimeString();

    db.run(
        `
        INSERT INTO decomiso(

            producto,
            cantidad,
            motivo,
            responsable,
            fecha,
            hora

        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [

            producto,
            cantidad,
            motivo,
            responsable,
            fecha,
            hora

        ],
        function(err){

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json({
                mensaje:
                "Decomiso registrado"
            });

        }
    );

});

app.get("/decomiso", (req, res) => {

    db.all(
        `
        SELECT *
        FROM decomiso
        ORDER BY id DESC
        `,
        [],
        (err, rows) => {

            if(err){

                return res.status(500).json({
                    error: err.message
                });

            }

            res.json(rows);

        }
    );

}); 

/* =========================
   SERVIDOR
========================= */


app.listen(PORT, () => {
    console.log("Servidor corriendo en puerto " + PORT);
});

app.get("/crear-admin", async (req, res) => {

    try {

        const hashedPassword = await bcrypt.hash("4321", 10);

        db.run(
            `
            INSERT INTO usuarios(nombre, usuario, password, rol)
            VALUES (?,?,?,?)
            `,
            [
                "Administrador",
                "admin",
                hashedPassword,
                "admin"
            ],
            function(err) {

                if(err) {
                    console.log(err);
                    return res.send(err.message);
                }

                res.send("Administrador creado con exito");

            }
        );

    } catch(error) {

        console.log(error);

        res.status(500).send(error.message);

    }

});