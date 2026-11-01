
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// --------------------------------------------------
// 1. CORS CONFIGURATION
// --------------------------------------------------

app.use(cors({
    origin: 'http://127.0.0.1:5500',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------------------------------------
// 2. MYSQL SESSION CONFIGURATION
// --------------------------------------------------

const sessionStore = new MySQLStore({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'quickbasket_db',
    createDatabaseTable: true
});

app.use(session({
    name: 'quickbasket.sid',
    secret: process.env.SESSION_SECRET || 'quickbasket-development-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));
// Admin authorization middleware
function isAdmin(req, res, next) {

    // Check whether user is logged in
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Please login first."
        });
    }

    // Check whether user is an admin
    if (req.session.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Access denied. Admins only."
        });
    }

    // Allow admin to continue
    next();
}

// --------------------------------------------------
// 3. HELPER: CHECK LOGIN
// --------------------------------------------------

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Please login first.'
        });
    }

    next();
}

// --------------------------------------------------
// 4. BASIC TEST ROUTES
// --------------------------------------------------

app.get('/', (req, res) => {
    res.send('QuickBasket backend is running!');
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'QuickBasket API is working!'
    });
});

app.get('/api/db-test', async (req, res) => {
    let connection;

    try {
        connection = await pool.getConnection();

        const [rows] = await connection.query(
            'SELECT DATABASE() AS databaseName, NOW() AS serverTime'
        );

        res.json({
            success: true,
            message: 'Node.js connected to MySQL successfully!',
            database: rows[0].databaseName,
            mysqlTime: rows[0].serverTime
        });

    } catch (error) {
        console.error('MySQL connection error:', error.message);

        res.status(500).json({
            success: false,
            message: 'MySQL connection failed.'
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// --------------------------------------------------
// 5. USER SIGNUP
// --------------------------------------------------

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        if (!name || !email || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please fill in all required fields.'
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.'
            });
        }

        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Phone number must contain 10 digits.'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least 8 characters.'
            });
        }

        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'This email is already registered. Please login.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.execute(
            `INSERT INTO users
             (full_name, email, phone, password_hash)
             VALUES (?, ?, ?, ?)`,
            [name.trim(), email.trim().toLowerCase(), phone, passwordHash]
        );

        const user = {
            id: result.insertId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone
        };

        req.session.user = user;

        req.session.save((error) => {
            if (error) {
                console.error('Session save error:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Account created, but login session could not be saved. Please login.'
                });
            }

            res.status(201).json({
                success: true,
                message: 'Account created successfully!',
                user
            });
        });

    } catch (error) {
        console.error('Signup error:', error);

        res.status(500).json({
            success: false,
            message: 'Unable to create account. Please try again.'
        });
    }
});

// --------------------------------------------------
// 6. USER LOGIN
// --------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.'
            });
        }

        const [users] = await pool.execute(
            `SELECT id, full_name, email, phone, password_hash,role
             FROM users
             WHERE email = ?`,
            [email.trim().toLowerCase()]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        const dbUser = users[0];

        const passwordMatches = await bcrypt.compare(
            password,
            dbUser.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        const user = {
            id: dbUser.id,
            name: dbUser.full_name,
            email: dbUser.email,
            phone: dbUser.phone,
            role: dbUser.role
        };

        req.session.user = user;

        req.session.save((error) => {
            if (error) {
                console.error('Login session error:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Unable to save login session.'
                });
            }

            res.json({
                success: true,
                message: 'Login successful!',
                user
            });
        });

    } catch (error) {
        console.error('Login error:', error);

        res.status(500).json({
            success: false,
            message: 'Unable to login. Please try again.'
        });
    }
});

// --------------------------------------------------
// 7. CHECK CURRENT LOGIN SESSION
// --------------------------------------------------

app.get('/api/auth/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'You are not logged in.'
        });
    }

    res.json({
        success: true,
        user: req.session.user
    });
});

// --------------------------------------------------
// 8. USER LOGOUT
// --------------------------------------------------

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error('Logout error:', error);

            return res.status(500).json({
                success: false,
                message: 'Unable to logout.'
            });
        }

        res.clearCookie('quickbasket.sid');

        res.json({
            success: true,
            message: 'Logged out successfully!'
        });
    });
});

// --------------------------------------------------
// 9. GET ALL ACTIVE PRODUCTS
// --------------------------------------------------

app.get('/api/products', async (req, res) => {
    try {
        const [products] = await pool.query(
            `SELECT id, name, category, price, image_url, stock
             FROM products
             WHERE is_active = TRUE
             ORDER BY category, name`
        );

        res.json({
            success: true,
            count: products.length,
            products
        });

    } catch (error) {
        console.error('Products API error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to fetch products.'
        });
    }
});

// Admin: View all products
app.get('/api/admin/products', isAdmin, async (req, res) => {
    try {
        const [products] = await pool.query(
            `SELECT id, name, category, price, image_url, stock, is_active
             FROM products
             ORDER BY id DESC`
        );

        res.json({
            success: true,
            products
        });

    } catch (error) {
        console.error('Admin products error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to fetch products.'
        });
    }
});
app.get('/api/admin/orders/count', isAdmin, async (req, res) => {
    try {
        const [result] = await pool.execute(
            'SELECT COUNT(*) AS totalOrders FROM orders'
        );

        res.json({
            success: true,
            totalOrders: result[0].totalOrders
        });

    } catch (error) {
        console.error('Fetch order count error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to fetch total orders.'
        });
    }
});
// Admin: Add a new product
app.post('/api/admin/products', isAdmin, async (req, res) => {
    try {
        const { name, category, price, image_url, stock } = req.body;

        // Validate product details
        if (!name || !category || price === undefined || stock === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required product details.'
            });
        }

        const productName = name.trim();
        const productCategory = category.trim();
        const productPrice = Number(price);
        const productStock = Number(stock);

        if (!productName || !productCategory ||
            productName.length > 150 ||
            productCategory.length > 60 ||
            !Number.isFinite(productPrice) || productPrice <= 0 ||
            !Number.isInteger(productStock) || productStock < 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product details.'
            });
        }

        if (image_url && image_url.length > 500) {
            return res.status(400).json({
                success: false,
                message: 'Image URL is too long.'
            });
        }

        // Insert product into database
        const [result] = await pool.execute(
            `INSERT INTO products
             (name, category, price, image_url, stock)
             VALUES (?, ?, ?, ?, ?)`,
            [
                productName,
                productCategory,
                productPrice,
                image_url || null,
                productStock
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Product added successfully!',
            productId: result.insertId
        });

    } catch (error) {
        console.error('Add product error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to add product.'
        });
    }
});
// Admin: Update an existing product
app.put('/api/admin/products/:id', isAdmin, async (req, res) => {
    try {
        const productId = Number(req.params.id);
        const { name, category, price, image_url, stock } = req.body;

        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID.'
            });
        }

        if (!name || !category || price === undefined || stock === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required product details.'
            });
        }

        const productName = name.trim();
        const productCategory = category.trim();
        const productPrice = Number(price);
        const productStock = Number(stock);

        if (!productName || !productCategory ||
            productName.length > 150 ||
            productCategory.length > 60 ||
            !Number.isFinite(productPrice) || productPrice <= 0 ||
            !Number.isInteger(productStock) || productStock < 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product details.'
            });
        }

        if (image_url && (typeof image_url !== 'string' || image_url.length > 500)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid image URL.'
            });
        }

        const [result] = await pool.execute(
            `UPDATE products
             SET name = ?, category = ?, price = ?, image_url = ?, stock = ?
             WHERE id = ?`,
            [
                productName,
                productCategory,
                productPrice,
                image_url || null,
                productStock,
                productId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found.'
            });
        }

        res.json({
            success: true,
            message: 'Product updated successfully!'
        });

    } catch (error) {
        console.error('Update product error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to update product.'
        });
    }
});
// --------------------------------------------------
// 10. GET PRODUCTS BY CATEGORY
// --------------------------------------------------

app.get('/api/products/category/:category', async (req, res) => {
    try {
        const [products] = await pool.execute(
            `SELECT id, name, category, price, image_url, stock
             FROM products
             WHERE is_active = TRUE AND category = ?
             ORDER BY name`,
            [req.params.category]
        );

        res.json({
            success: true,
            count: products.length,
            products
        });

    } catch (error) {
        console.error('Category API error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to fetch category products.'
        });
    }
});

// --------------------------------------------------
// CREATE NEW ORDER
// --------------------------------------------------

app.post('/api/orders', async (req, res) => {
    let connection;

    try {
        // 1. Check login session
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Please login to place an order.'
            });
        }

        const userId = req.session.user.id;

        // 2. Get checkout details
        const { items, deliveryPhone, deliveryAddress, paymentMethod } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty.'
            });
        }

        const phonePattern = /^[6-9]\d{9}$/;

        if (!phonePattern.test(deliveryPhone || '')) {
            return res.status(400).json({
                success: false,
                message: 'Enter a valid delivery phone number.'
            });
        }

        if (typeof deliveryAddress !== 'string' ||
            deliveryAddress.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Enter a complete delivery address.'
            });
        }

        const allowedMethods = ['upi', 'netbanking', 'card', 'cod'];

        if (!allowedMethods.includes(paymentMethod)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment method.'
            });
        }

        // 3. Validate cart items
        const quantities = new Map();

        for (const item of items) {
            const id = Number(item.id);
            const quantity = Number(item.quantity);

            if (!Number.isSafeInteger(id) || id <= 0 ||
                !Number.isSafeInteger(quantity) || quantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid product or quantity.'
                });
            }

            quantities.set(id, (quantities.get(id) || 0) + quantity);
        }

        const productIds = [...quantities.keys()];

        // 4. Start MySQL transaction
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 5. Get actual product prices and lock stock rows
        const [products] = await connection.execute(
            `SELECT id, name, price, stock
             FROM products
             WHERE id IN (${productIds.map(() => '?').join(',')})
             AND is_active = TRUE
             FOR UPDATE`,
            productIds
        );

        if (products.length !== productIds.length) {
            throw new Error('One or more products are unavailable.');
        }

        // 6. Calculate total using database prices
        let totalCents = 0;
        const orderItems = [];

        for (const product of products) {
            const quantity = quantities.get(product.id);

            if (product.stock < quantity) {
                throw new Error(
                    `Insufficient stock for ${product.name}.`
                );
            }

            const unitPrice = Number(product.price);
            const unitPriceCents = Math.round(unitPrice * 100);

            totalCents += unitPriceCents * quantity;

            orderItems.push({
                productId: product.id,
                quantity,
                unitPrice: unitPriceCents
            });
        }

        const totalAmount = (totalCents / 100).toFixed(2);

        // 7. Insert main order
        const [orderResult] = await connection.execute(
            `INSERT INTO orders
             (user_id, total_amount, delivery_phone,
              delivery_address, payment_method,
              payment_status, order_status)
             VALUES (?, ?, ?, ?, ?, 'pending', 'placed')`,
            [
                userId,
                totalAmount,
                deliveryPhone,
                deliveryAddress.trim(),
                paymentMethod
            ]
        );

        const orderId = orderResult.insertId;

        // 8. Insert individual order items and reduce stock
        for (const item of orderItems) {
            await connection.execute(
                `INSERT INTO order_items
                 (order_id, product_id, quantity, unit_price)
                 VALUES (?, ?, ?, ?)`,
                [
                    orderId,
                    item.productId,
                    item.quantity,
                    (item.unitPrice / 100).toFixed(2)
                ]
            );

            await connection.execute(
                `UPDATE products
                 SET stock = stock - ?
                 WHERE id = ?`,
                [item.quantity, item.productId]
            );
        }

        // 9. Save all changes
        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Order placed successfully!',
            orderId,
            totalAmount
        });

    } catch (error) {

        if (connection) {
            await connection.rollback();
        }

        console.error('Order placement error:', error.message);

        res.status(400).json({
            success: false,
            message: error.message || 'Unable to place order.'
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.get('/api/orders', async (req, res) => {

    try {

        // 1. Check login session
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Please login to view your orders.'
            });
        }

        const userId = req.session.user.id;

        // 2. Fetch orders belonging to this user
        const [orders] = await pool.execute(
            `SELECT
                id,
                total_amount,
                payment_method,
                payment_status,
                order_status,
                created_at
             FROM orders
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        // 3. Fetch items for each order
        for (const order of orders) {

            const [items] = await pool.execute(
                `SELECT
                    products.name,
                    order_items.quantity,
                    order_items.unit_price
                 FROM order_items
                 JOIN products
                    ON order_items.product_id = products.id
                 WHERE order_items.order_id = ?`,
                [order.id]
            );

            order.items = items;
        }

        // 4. Send order history
        res.json({
            success: true,
            orders
        });

    } catch (error) {

        console.error('Fetch orders error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to fetch your orders.'
        });

    }

});



// --------------------------------------------------
// 11. START SERVER
// --------------------------------------------------

app.listen(PORT, () => {
    console.log(`QuickBasket server running at http://localhost:${PORT}`);
});
