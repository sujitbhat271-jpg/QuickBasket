
const API_BASE = "/api";

let currentUser = null;

// Display messages
function showMessage(id, message, success = false) {
    const element = document.getElementById(id);

    if (!element) return;

    element.textContent = message;
    element.className = success
        ? "success-message text-center"
        : "error-message text-center";
}

// Check whether the user is logged in
function isLoggedIn() {
    return currentUser !== null;
}

window.updateLoginStatus = function() {

    const loggedIn = isLoggedIn();

    const loginNav = document.getElementById("loginNav");
    const signupNav = document.getElementById("signupNav");
    const ordersNav = document.getElementById("ordersNav");
    const adminNav = document.getElementById("adminNav");
    const logoutNav = document.getElementById("logoutNav");

    if (loginNav) {
        loginNav.style.display = loggedIn ? "none" : "block";
    }

    if (signupNav) {
        signupNav.style.display = loggedIn ? "none" : "block";
    }

    if (ordersNav) {
        ordersNav.style.display = loggedIn ? "block" : "none";
    }

    if (logoutNav) {
        logoutNav.style.display = loggedIn ? "block" : "none";
    }

    if (adminNav) {
        adminNav.style.display =
            loggedIn && currentUser.role === "admin"
                ? "block"
                : "none";
    }
};


// Signup
document.addEventListener("DOMContentLoaded", () => {

    const signupForm = document.getElementById("signupForm");
    const loginForm = document.getElementById("loginForm");

    if (signupForm) {
        signupForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            document.querySelectorAll(
                "#signupForm .error-message"
            ).forEach(el => el.textContent = "");

            showMessage("signupSuccess", "");

            const name = document.getElementById("signupName").value.trim();
            const email = document.getElementById("signupEmail").value.trim();
            const phone = document.getElementById("signupPhone").value.trim();
            const password = document.getElementById("signupPassword").value;
            const confirmPassword =
                document.getElementById("signupConfirmPassword").value;
            const terms = document.getElementById("terms").checked;

            let valid = true;

            if (name.length < 3) {
                showMessage("nameError", "Enter a valid full name.");
                valid = false;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showMessage("emailError", "Enter a valid email address.");
                valid = false;
            }

            if (!/^[6-9]\d{9}$/.test(phone)) {
                showMessage("phoneError", "Enter a valid 10-digit phone number.");
                valid = false;
            }

            const strongPassword =
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

            if (!strongPassword.test(password)) {
                showMessage(
                    "passwordError",
                    "Use 8+ characters with uppercase, lowercase, number and special character."
                );
                valid = false;
            }

            if (password !== confirmPassword) {
                showMessage(
                    "confirmPasswordError",
                    "Passwords do not match."
                );
                valid = false;
            }

            if (!terms) {
                showMessage(
                    "termsError",
                    "Please accept the terms and conditions."
                );
                valid = false;
            }

            if (!valid) return;

            const button = signupForm.querySelector("button[type='submit']");
            button.disabled = true;
            button.textContent = "Creating account...";

            try {
                const response = await fetch(`${API_BASE}/auth/signup`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        name,
                        email,
                        phone,
                        password
                    })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    showMessage(
                        "signupSuccess",
                        data.message || "Registration failed."
                    );
                    return;
                }

                currentUser = data.user;

                showMessage(
                    "signupSuccess",
                    "Account created successfully!",
                    true
                );

                if (typeof window.updateLoginStatus === "function") {
                    window.updateLoginStatus();
                }
                setTimeout(() => {
                    window.location.hash = "#home";

                    if (typeof window.router === "function") {
                        window.router();
                    }
                }, 1000);
               

            } catch (error) {
                console.error("Signup error:", error);
                showMessage(
                    "signupSuccess",
                    "Cannot connect to server. Please try again."
                );
            } finally {
                button.disabled = false;
                button.textContent = "Sign Up";
            }
        });
    }

    // Login
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            showMessage("loginEmailError", "");
            showMessage("loginPasswordError", "");
            showMessage("loginError", "");

            const email = document.getElementById("loginEmail").value.trim();
            const password = document.getElementById("loginPassword").value;

            let valid = true;

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showMessage("loginEmailError", "Enter a valid email address.");
                valid = false;
            }

            if (!password) {
                showMessage("loginPasswordError", "Password is required.");
                valid = false;
            }

            if (!valid) return;

            const button = loginForm.querySelector("button[type='submit']");
            button.disabled = true;
            button.textContent = "Logging in...";

            try {
                const response = await fetch(`${API_BASE}/auth/login`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    showMessage(
                        "loginError",
                        data.message || "Invalid login details."
                    );
                    return;
                }

                currentUser = data.user;

                if (typeof window.updateLoginStatus === "function") {
                    window.updateLoginStatus();
                }

                alert("Welcome to QuickBasket, " + currentUser.name + "!");

                window.location.hash = "#home";

                if (typeof window.router === "function") {
                    window.router();
            }

            } catch (error) {
                console.error("Login error:", error);
                showMessage(
                    "loginError",
                    "Cannot connect to server. Please try again."
                );
            } finally {
                button.disabled = false;
                button.textContent = "Login";
            }
        });
    }

    // Restore an existing login session after refreshing
    checkSession();
});

// Check existing session
async function checkSession() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            credentials: "include"
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
        } else {
            currentUser = null;
        }

    } catch (error) {
        console.error("Session check failed:", error);
        currentUser = null;
    }

    if (typeof window.updateLoginStatus === "function") {
        window.updateLoginStatus();
    }

    if (typeof window.router === "function") {
        window.router();
    }
}

// Logout
window.logoutUser = async function () {
    try {
        const response = await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || "Logout failed.");
            return;
        }

        currentUser = null;

        if (typeof window.updateLoginStatus === "function") {
            window.updateLoginStatus();
        }

        alert("You have been logged out.");
        window.location.hash = "login";

    } catch (error) {
        console.error("Logout error:", error);
        alert("Unable to connect to the server.");
    }
};

// Make authentication state available to the existing application
window.isLoggedIn = isLoggedIn;
// Admin: Add Product
document.addEventListener("DOMContentLoaded", function () {

    const addProductForm = document.getElementById("addProductForm");

    if (!addProductForm) return;

    addProductForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const product = {
            name: document.getElementById("productName").value.trim(),
            category: document.getElementById("productCategory").value.trim(),
            price: Number(document.getElementById("productPrice").value),
            image_url: document.getElementById("productImage").value.trim() || null,
            stock: Number(document.getElementById("productStock").value)
        };

        const message = document.getElementById("productMessage");

        try {

            const response = await fetch(`${API_BASE}/admin/products`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(product)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to add product.");
            }

            message.innerHTML = `
                <p class="text-success">
                    ${data.message} Product ID: ${data.productId}
                </p>
            `;

            addProductForm.reset();

        } catch (error) {

            message.innerHTML = `
                <p class="text-danger">${error.message}</p>
            `;

        }

    });

});
// Admin: Load all products
async function loadAdminProducts() {

    const container = document.getElementById("adminProductsContainer");

    if (!container) return;

    container.innerHTML = "<p>Loading products...</p>";

    try {
        const response = await fetch(`${API_BASE}/admin/products`, {
            method: "GET",
            credentials: "include"
        });

        const data = await response.json();
        await loadTotalOrders();
        document.getElementById("totalProducts").textContent =
            data.products.length;
        if (!response.ok) {
            throw new Error(data.message || "Unable to load products.");
        }

        if (data.products.length === 0) {
            container.innerHTML = "<p>No products found.</p>";
            return;
        }
        container.innerHTML = data.products.map(product => `
        <div class="card p-3 mb-3">
                <h5>${product.name}</h5>

                <p>Category: ${product.category}</p>
                <p>Price: ₹${product.price}</p>
                <p>Stock: ${product.stock}</p>
                <p>Status: ${product.is_active ? "Active" : "Inactive"}</p>

                <button class="btn btn-primary btn-sm"
                    onclick="editProduct(${product.id})">
                    Edit Product
                </button>
            </div>
        `).join("");
        
            
        

    } catch (error) {
        container.innerHTML = `
            <p class="text-danger">${error.message}</p>
        `;
    }
}
// Open product editing form
window.editProduct = async function(productId) {

    try {
        const response = await fetch(`${API_BASE}/admin/products`, {
            credentials: "include"
        });

        const data = await response.json();

    
        if (!response.ok) {
            throw new Error(data.message || "Unable to load products.");
        }

        const product = data.products.find(p => p.id === productId);

        if (!product) {
            alert("Product not found.");
            return;
        }

        document.getElementById("editProductId").value = product.id;
        document.getElementById("editProductName").value = product.name;
        document.getElementById("editProductCategory").value = product.category;
        document.getElementById("editProductPrice").value = product.price;
        document.getElementById("editProductImage").value = product.image_url || "";
        document.getElementById("editProductStock").value = product.stock;

        document.getElementById("editProductMessage").innerHTML = "";

        document.getElementById("editProductContainer").style.display = "block";

        document.getElementById("editProductContainer")
            .scrollIntoView({ behavior: "smooth" });

    } catch (error) {
        alert(error.message);
    }
};

// Cancel editing
window.cancelEditProduct = function() {
    document.getElementById("editProductContainer").style.display = "none";
};
// Admin: Save edited product
document.addEventListener("DOMContentLoaded", function () {

    const editProductForm = document.getElementById("editProductForm");

    if (!editProductForm) return;

    editProductForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const productId = document.getElementById("editProductId").value;

        const product = {
            name: document.getElementById("editProductName").value.trim(),
            category: document.getElementById("editProductCategory").value.trim(),
            price: Number(document.getElementById("editProductPrice").value),
            image_url: document.getElementById("editProductImage").value.trim() || null,
            stock: Number(document.getElementById("editProductStock").value)
        };

        const message = document.getElementById("editProductMessage");

        try {

            const response = await fetch(`${API_BASE}/admin/products/${productId}`, {
                method: "PUT",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(product)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to update product.");
            }

            message.innerHTML = `
                <p class="text-success">${data.message}</p>
            `;

            await loadAdminProducts();

            document.getElementById("editProductContainer").style.display = "none";

        } catch (error) {

            message.innerHTML = `
                <p class="text-danger">${error.message}</p>
            `;

        }

    });

});
async function loadTotalOrders() {
    try {
        const response = await fetch(`${API_BASE}/admin/orders/count`, {
            method: "GET",
            credentials: "include"
        });

        const data = await response.json();

        if (response.ok && data.success) {
            document.getElementById("totalOrders").textContent =
                data.totalOrders;
        }

    } catch (error) {
        console.error("Error loading total orders:", error);
    }
}