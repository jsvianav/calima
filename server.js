const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = 'admin123'; // Clave de acceso para administrar

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Dynamic Database Connection
const usePg = !!process.env.DATABASE_URL;
let pgClient = null;
let sqliteDb = null;

if (usePg) {
  const { Client } = require('pg');
  pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  pgClient.connect((err) => {
    if (err) {
      console.error('Error al conectar con PostgreSQL:', err.message);
    } else {
      console.log('Conectado exitosamente a la base de datos PostgreSQL online.');
      initDatabase();
    }
  });
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbFile = path.join(__dirname, 'database.sqlite');
  sqliteDb = new sqlite3.Database(dbFile, (err) => {
    if (err) {
      console.error('Error al conectar con SQLite:', err.message);
    } else {
      console.log('Conectado exitosamente a la base de datos SQLite local.');
      initDatabase();
    }
  });
}

// Helper to translate query placeholders from '?' to '$1, $2' for PostgreSQL
function prepareQuery(sql) {
  if (usePg) {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  }
  return sql;
}

// Unified db execution helpers
function queryAll(sql, params = []) {
  const preparedSql = prepareQuery(sql);
  return new Promise((resolve, reject) => {
    if (usePg) {
      pgClient.query(preparedSql, params, (err, result) => {
        if (err) reject(err);
        else resolve(result.rows);
      });
    } else {
      sqliteDb.all(preparedSql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    }
  });
}

function runCmd(sql, params = []) {
  const preparedSql = prepareQuery(sql);
  return new Promise((resolve, reject) => {
    if (usePg) {
      let finalSql = preparedSql;
      const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
      if (isInsert) {
        finalSql += ' RETURNING id';
      }
      pgClient.query(finalSql, params, (err, result) => {
        if (err) reject(err);
        else {
          const lastID = isInsert && result.rows[0] ? result.rows[0].id : null;
          resolve({ lastID, changes: result.rowCount });
        }
      });
    } else {
      sqliteDb.run(preparedSql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    }
  });
}

// Table initialization
function initDatabase() {
  let createTableSql = '';
  if (usePg) {
    createTableSql = `
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        checkin VARCHAR(50) NOT NULL,
        checkout VARCHAR(50) NOT NULL,
        adults INTEGER NOT NULL,
        kids INTEGER DEFAULT 0,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        comments TEXT,
        total VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'Sin Confirmar',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
  } else {
    createTableSql = `
      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checkin TEXT NOT NULL,
        checkout TEXT NOT NULL,
        adults INTEGER NOT NULL,
        kids INTEGER DEFAULT 0,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        comments TEXT,
        total TEXT NOT NULL,
        status TEXT DEFAULT 'Sin Confirmar',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
  }

  const dbPromise = usePg 
    ? pgClient.query(createTableSql)
    : new Promise((resolve, reject) => {
        sqliteDb.run(createTableSql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

  dbPromise
    .then(() => console.log('Tabla de reservas verificada/creada.'))
    .catch((err) => console.error('Error al crear la tabla de reservas:', err.message));
}

// Helper para validar si el token/clave es del administrador
function isAdmin(req) {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  return token === ADMIN_PASSWORD;
}

// ==========================================================================
// Endpoints API REST
// ==========================================================================

// 1. Obtener Reservas
app.get('/api/reservations', async (req, res) => {
  const queryAdmin = isAdmin(req);
  try {
    if (queryAdmin) {
      const rows = await queryAll('SELECT * FROM reservations ORDER BY checkin DESC');
      res.json(rows);
    } else {
      const rows = await queryAll("SELECT id, checkin, checkout, status FROM reservations WHERE status != 'Cancelada' ORDER BY checkin DESC");
      res.json(rows);
    }
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar la base de datos: ' + err.message });
  }
});

// 2. Crear una nueva reserva
app.post('/api/reservations', async (req, res) => {
  const { checkin, checkout, adults, kids, name, phone, email, comments, total } = req.body;

  if (!checkin || !checkout || !adults || !name || !phone || !email || !total) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para completar la reserva.' });
  }

  const sql = `
    INSERT INTO reservations (checkin, checkout, adults, kids, name, phone, email, comments, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [checkin, checkout, parseInt(adults, 10), parseInt(kids || 0, 10), name, phone, email, comments || '', total];

  try {
    const result = await runCmd(sql, params);
    res.status(201).json({
      id: result.lastID,
      checkin,
      checkout,
      adults,
      kids,
      name,
      phone,
      email,
      comments,
      total,
      status: 'Sin Confirmar'
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar la reserva en la base de datos: ' + err.message });
  }
});

// 3. Modificar una reserva existente (Requiere Token de Administrador)
app.put('/api/reservations/:id', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'No autorizado. Se requiere contraseña de administrador.' });
  }

  const { id } = req.params;
  const { checkin, checkout, adults, kids, name, phone, email, comments, total, status } = req.body;

  if (!checkin || !checkout || !adults || !name || !phone || !email || !total || !status) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para actualizar.' });
  }

  const sql = `
    UPDATE reservations 
    SET checkin = ?, checkout = ?, adults = ?, kids = ?, name = ?, phone = ?, email = ?, comments = ?, total = ?, status = ?
    WHERE id = ?
  `;
  const params = [checkin, checkout, parseInt(adults, 10), parseInt(kids || 0, 10), name, phone, email, comments || '', total, status, id];

  try {
    const result = await runCmd(sql, params);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada con el ID especificado.' });
    }
    res.json({ message: 'Reserva actualizada exitosamente.', changes: result.changes });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar la reserva: ' + err.message });
  }
});

// 4. Eliminar una reserva (Requiere Token de Administrador)
app.delete('/api/reservations/:id', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'No autorizado. Se requiere contraseña de administrador.' });
  }

  const { id } = req.params;

  try {
    const result = await runCmd('DELETE FROM reservations WHERE id = ?', [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada con el ID especificado.' });
    }
    res.json({ message: 'Reserva eliminada exitosamente.', changes: result.changes });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar la reserva: ' + err.message });
  }
});

// Servir la página principal si se entra a cualquier otra ruta no API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor de Finca Calima Villa Melissa ejecutándose en http://localhost:${PORT}`);
});
