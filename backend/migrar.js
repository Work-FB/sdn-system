require("dotenv").config();

const sqlite3 = require("sqlite3").verbose();
const { Pool } = require("pg");

const sqliteDB = new sqlite3.Database(
    "./database.db",
    (err) => {
        if (err) {
            console.log("❌ Error SQLite:", err.message);
        } else {
            console.log("✅ SQLite conectado");
        }
    }
);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrarTabla(tabla) {

    sqliteDB.all(`SELECT * FROM ${tabla}`, async (err, rows) => {

        if (err) {
            console.log(err);
            return;
        }

        for (const row of rows) {

            const columnas = Object.keys(row);
            const valores = Object.values(row);

            const placeholders =
                columnas.map((_, i) => `$${i + 1}`).join(",");

            const sql = `
                INSERT INTO ${tabla}
                (${columnas.join(",")})
                VALUES (${placeholders})
                ON CONFLICT DO NOTHING
            `;

            try {

                await pool.query(sql, valores);

                console.log(`✅ ${tabla}`);

            } catch(error) {

                console.log(`❌ Error en ${tabla}`, error.message);

            }

        }

    });

}

async function iniciar() {

    await migrarTabla("usuarios");
    await migrarTabla("menus");
    await migrarTabla("productos");
    await migrarTabla("ventas");
    await migrarTabla("gastos");
    await migrarTabla("depositos");
    await migrarTabla("dolares");
    await migrarTabla("caja");
    await migrarTabla("decomiso");
    await migrarTabla("asistencia");
    await migrarTabla("movimientos");
    await migrarTabla("cuadres");
    await migrarTabla("productos_vendidos");

}

iniciar();
