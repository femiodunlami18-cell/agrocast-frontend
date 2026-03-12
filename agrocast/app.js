const API_KEY = '4bd2e5de2695e51cd40343bc46862c29';

document.addEventListener("DOMContentLoaded", () => {
    const profile = JSON.parse(localStorage.getItem("farmer_profile"));

    const API_BASE_URL = 'https://agro-cast.onrender.com';

    window.apiFetch = async function (endpoint, options = {}) {
        const token = localStorage.getItem('agrocast_token');
        const defaultHeaders = {
            'Content-Type': 'application/json'
        };

        if (token) {
            defaultHeaders['Authorization'] = `Bearer ${token}`;
        }

        const fetchOptions = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        };

        const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

        if (!response.ok) {
            let errorMessage = 'An error occurred';
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (e) {
                // If it's not JSON, maybe plain text or just status block
                errorMessage = response.statusText;
            }
            throw new Error(errorMessage);
        }

        // Some responses might be empty (like 200 OK simply)
        try {
            return await response.json();
        } catch (e) {
            return {};
        }
    };

    // 1. LOGIN LOGIC
    if (document.getElementById("loginBtn")) {
        const loginBtn = document.getElementById("loginBtn");
        loginBtn.addEventListener("click", async () => {
            const usernameInput = document.getElementById("loginUser").value;
            const passwordInput = document.getElementById("loginPass").value;

            if (usernameInput && passwordInput) {
                const originalText = loginBtn.innerText;
                loginBtn.innerText = "Logging in...";
                loginBtn.disabled = true;

                try {
                    const data = await window.apiFetch('/users/login', {
                        method: 'POST',
                        body: JSON.stringify({
                            username: usernameInput,
                            password: passwordInput
                        })
                    });

                    // On success, save token and user info
                    if (data.token) {
                        localStorage.setItem('agrocast_token', data.token);
                        localStorage.setItem('farmer_profile', JSON.stringify(data.user));
                        window.location.href = "./dashboard.html";
                    } else {
                        throw new Error("Invalid response from server");
                    }
                } catch (error) {
                    alert(`Login failed: ${error.message}`);
                    loginBtn.innerText = originalText;
                    loginBtn.disabled = false;
                }
            } else {
                alert("Please enter both username and password!");
            }
        });
    }

    // 1b. REGISTRATION LOGIC
    if (document.getElementById("registerBtn")) {
        const registerBtn = document.getElementById("registerBtn");
        registerBtn.addEventListener("click", async () => {
            const data = {
                username: document.getElementById("regUsername").value,
                firstName: document.getElementById("regName").value,
                lastName: document.getElementById("regSurname").value,
                phoneNumber: document.getElementById("regPhone").value || "Not provided",
                email: document.getElementById("regEmail").value,
                password: document.getElementById("regPassword").value,
                confirmPassword: document.getElementById("regConfirmPassword").value
            };

            if (data.username && data.firstName && data.lastName && data.email && data.password && data.confirmPassword) {
                if (data.password !== data.confirmPassword) {
                    alert("Passwords do not match!");
                    return;
                }

                const originalText = registerBtn.innerText;
                registerBtn.innerText = "Registering...";
                registerBtn.disabled = true;

                try {
                    const responseData = await window.apiFetch('/users/register', {
                        method: 'POST',
                        body: JSON.stringify(data)
                    });

                    // Depending on API response, it might auto-login or just send success message
                    if (responseData && responseData.token) {
                        localStorage.setItem('agrocast_token', responseData.token);
                        localStorage.setItem('farmer_profile', JSON.stringify(responseData.user));
                        window.location.href = "./dashboard.html";
                    } else {
                        // Registration success but maybe requires manual login or email verification
                        alert("Registration successful! Please login.");
                        window.location.href = "./login.html";
                    }
                } catch (error) {
                    alert(`Registration failed: ${error.message}`);
                    registerBtn.innerText = originalText;
                    registerBtn.disabled = false;
                }
            } else {
                alert("Please fill all required fields!");
            }
        });
    }

    // 2. DASHBOARD LOGIC
    if (document.getElementById("tempText")) {
        if (!profile) window.location.href = "./index.html";
        document.getElementById("userGreeting").innerText = `Hi, ${profile.firstName || profile.username}`;

        // Elements
        const modal = document.getElementById("createFarmModal");
        const submitFarmBtn = document.getElementById("submitFarmBtn");

        async function loadDashboardData() {
            try {
                // 1. Fetch user's farms
                const farms = await window.apiFetch(`/farms/user/${profile.id}`);

                if (!farms || farms.length === 0) {
                    // Show create farm modal
                    modal.style.display = "flex";
                } else {
                    // Use the first farm for dashboard
                    const primaryFarm = farms[0];
                    fetchWeather(primaryFarm);
                }
            } catch (e) {
                console.error("Error loading dashboard data:", e);
                // Fallback to modal if error
                modal.style.display = "flex";
            }
        }

        // Handle Farm Creation
        if (submitFarmBtn) {
            submitFarmBtn.addEventListener("click", async () => {
                const farmData = {
                    userId: profile.id,
                    name: document.getElementById("farmName").value,
                    location: document.getElementById("farmLocation").value,
                    latitude: parseFloat(document.getElementById("farmLat").value),
                    longitude: parseFloat(document.getElementById("farmLng").value),
                    size: 1.0, // Default size
                    cropType: document.getElementById("farmCrop").value,
                    state: document.getElementById("farmState").value
                };

                if (farmData.name && farmData.location && !isNaN(farmData.latitude) && !isNaN(farmData.longitude)) {
                    const originalText = submitFarmBtn.innerText;
                    submitFarmBtn.innerText = "Saving...";
                    submitFarmBtn.disabled = true;

                    try {
                        const newFarm = await window.apiFetch('/farms/create', {
                            method: 'POST',
                            body: JSON.stringify(farmData)
                        });

                        modal.style.display = "none";
                        fetchWeather(newFarm);
                    } catch (e) {
                        alert(`Failed to create farm: ${e.message}`);
                    } finally {
                        submitFarmBtn.innerText = originalText;
                        submitFarmBtn.disabled = false;
                    }
                } else {
                    alert("Please fill all fields with valid data!");
                }
            });
        }

        // Initialize dashboard
        loadDashboardData();
    }

    // 3. PROFILE DISPLAY LOGIC
    if (document.getElementById("profName")) {
        if (!profile) window.location.href = "./index.html";

        // Show cached info first
        document.getElementById("profName").innerText = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.username;
        document.getElementById("profEmail").innerText = profile.email || "No email provided";
        if (document.getElementById("profUsername")) document.getElementById("profUsername").innerText = `@${profile.username}`;
        if (document.getElementById("profPhone")) document.getElementById("profPhone").innerText = profile.phoneNumber || "Not specified";

        document.getElementById("logoutBtn").addEventListener("click", async () => {
            try {
                // Call logout API just in case backend expects it
                await window.apiFetch('/users/logout', { method: 'POST' });
            } catch (e) {
                console.error("Error logging out from server:", e);
            } finally {
                localStorage.removeItem('agrocast_token');
                localStorage.removeItem('farmer_profile');
                window.location.href = "./index.html";
            }
        });
    }
});

async function fetchWeather(farm) {
    try {
        // First set location name to let user know it's loading
        document.getElementById("locationName").innerText = farm.name || farm.location;
        document.getElementById("tempText").innerText = `...`;
        document.getElementById("advisory-text").innerText = `Analyzing conditions for ${farm.cropType}...`;

        // 1. Fetch recommendations from our backend
        const recData = await window.apiFetch(`/recommendations/farm/${farm.id}`);

        if (recData && recData.success) {
            // Recommendation endpoint returns prediction data containing conditions
            const conditions = recData.prediction.conditions;
            document.getElementById("tempText").innerText = `${Math.round(conditions.temperature)}°C`;

            // Set an icon based on conditions (basic logic since backend doesn't provide icon directly for weather)
            let iconCode = '01d'; // default clear
            if (conditions.rainfall > 10) iconCode = '09d'; // rain
            else if (conditions.humidity > 80) iconCode = '04d'; // cloudy

            document.getElementById("weather-icon").src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;

            // Display advisory
            let advice = recData.summary || `Conditions look good for ${farm.cropType}.`;
            if (recData.recommendations && recData.recommendations.length > 0) {
                // Use the highest priority message if available
                const topRec = recData.recommendations.find(r => r.priority === 'HIGH') || recData.recommendations[0];
                advice = `${topRec.type}: ${topRec.message}`;
            }

            document.getElementById("advisory-text").innerText = advice;
        } else {
            document.getElementById("advisory-text").innerText = "Could not load recommendations.";
            document.getElementById("tempText").innerText = `--°C`;
        }

    } catch (e) {
        console.error("Recommendations API error", e);
        document.getElementById("advisory-text").innerText = "Error analyzing conditions.";
        document.getElementById("tempText").innerText = `--°C`;
    }
}