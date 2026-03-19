const API_KEY = typeof CONFIG !== 'undefined' ? CONFIG.API_KEY : '4bd2e5de2695e51cd40343bc46862c29';

document.addEventListener("DOMContentLoaded", () => {
    const profile = JSON.parse(localStorage.getItem("farmer_profile"));

    const API_BASE_URL = typeof CONFIG !== 'undefined' ? CONFIG.API_BASE_URL : 'https://agro-cast.onrender.com';

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
            let errorMessage = `Server error (${response.status})`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch (e) {
                try {
                    const text = await response.text();
                    errorMessage = text || response.statusText || errorMessage;
                } catch (_) {}
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

                    // Success: Show thank you message and redirect to login
                    alert("Thank you for registering! An email was sent to you to verify your account.");
                    window.location.href = "./login.html";
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

        // Wake up the server in background (Render free tier sleeps after inactivity)
        fetch(`${API_BASE_URL}/recommendations/health`).catch(() => {});

        async function loadDashboardData() {
            try {
                // 1. Fetch user's farms
                const farms = await window.apiFetch(`/farms/user/${profile.id}`);

                if (!farms || farms.length === 0) {
                    console.log("No farms found for user.");
                    // Show message or state that farm is needed
                    const locElement = document.getElementById("locationName");
                    if (locElement) locElement.innerText = "No Farm Registered";
                    const advElement = document.getElementById("advisory-text");
                    if (advElement) advElement.innerText = "Click 'Manage Farms' to get started.";
                } else {
                    // Use the first farm for dashboard
                    const primaryFarm = farms[0];
                    fetchWeather(primaryFarm);
                }
            } catch (e) {
                console.error("Error loading dashboard data:", e);
            }
        }

        // Handle Modal Opening
        const openFarmModalBtn = document.getElementById("openFarmModalBtn");
        if (openFarmModalBtn) {
            openFarmModalBtn.addEventListener("click", () => {
                modal.style.display = "flex";
                loadSupportedCrops();
            });
        }

    // Initialize global logger
    window.logActivity = function(activity) {
        try {
            const profile = JSON.parse(localStorage.getItem("farmer_profile"));
            if (!profile) return;
            const key = `agrocast_logs_${profile.id}`;
            let logs = [];
            try { logs = JSON.parse(localStorage.getItem(key)) || []; } catch(e){}
            activity.createdAt = new Date().toISOString();
            activity.id = Date.now();
            logs.unshift(activity);
            if(logs.length > 50) logs = logs.slice(0, 50);
            localStorage.setItem(key, JSON.stringify(logs));
        } catch(e) { console.error("Logging failed", e); }
    };

    // 2. DASHBOARD LOGIC (continued)
        const FALLBACK_CROPS = ["Maize", "Rice", "Cassava", "Wheat", "Tomato", "Yam", "Sorghum", "Millet", "Cowpea", "Groundnut", "Soybean", "Plantain"];

        async function loadSupportedCrops() {
            const cropSelect = document.getElementById("farmCrop");
            if (!cropSelect) return;

            try {
                const response = await window.apiFetch('/recommendations/crops');
                // API returns: { crops: ['maize', 'rice', ...], totalCount: N }
                const cropList = response.crops || (Array.isArray(response) ? response : []);

                if (cropList.length > 0) {
                    cropSelect.innerHTML = '<option value="">Select a crop</option>';
                    cropList.forEach(crop => {
                        const option = document.createElement("option");
                        const cropName = typeof crop === 'string' ? crop : (crop.name || crop.cropType || String(crop));
                        option.value = cropName.toLowerCase();
                        option.textContent = cropName.charAt(0).toUpperCase() + cropName.slice(1);
                        cropSelect.appendChild(option);
                    });
                } else {
                    throw new Error("Empty crop list");
                }
            } catch (e) {
                console.warn("Crops API failed, using fallback list:", e.message);
                cropSelect.innerHTML = '<option value="">Select a crop</option>';
                FALLBACK_CROPS.forEach(crop => {
                    const option = document.createElement("option");
                    option.value = crop.toLowerCase();
                    option.textContent = crop;
                    cropSelect.appendChild(option);
                });
            }
        }

        // Handle Farm Creation
        if (submitFarmBtn) {
            submitFarmBtn.addEventListener("click", async () => {
                const farmName = document.getElementById("farmName").value;
                const farmLocation = document.getElementById("farmLocation").value; // City
                const farmState = document.getElementById("farmState").value; // State
                const farmCrop = document.getElementById("farmCrop").value;

                if (farmName && farmLocation && farmState && farmCrop) {
                    const originalText = submitFarmBtn.innerText;
                    submitFarmBtn.innerText = "Finding Location...";
                    submitFarmBtn.disabled = true;

                    try {
                        // Use OpenWeatherMap Geocoding API to get lat/long from City, State
                        const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(farmLocation)},${encodeURIComponent(farmState)},NG&limit=1&appid=${API_KEY}`;
                        const geoResponse = await fetch(geoUrl);
                        if (!geoResponse.ok) throw new Error("Geocoding service unavailable");
                        
                        const geoData = await geoResponse.json();

                        if (!geoData || geoData.length === 0) {
                            throw new Error("Could not find coordinates for this location. Please check the city and state names.");
                        }

                        let latitude = geoData[0].lat;
                        let longitude = geoData[0].lon;

                        // Backend requires Nigerian bounds: lat 4-14, lon 2-15
                        if (latitude < 4.0 || latitude > 14.0 || longitude < 2.0 || longitude > 15.0) {
                            throw new Error(`Location coordinates (${latitude.toFixed(2)}, ${longitude.toFixed(2)}) are outside Nigeria. Please enter a valid Nigerian city.`);
                        }

                        const farmData = {
                            userId: profile.id,
                            name: farmName,
                            location: farmLocation,
                            latitude: latitude,
                            longitude: longitude,
                            size: 1.0,
                            cropType: farmCrop,
                            state: farmState
                        };

                        submitFarmBtn.innerText = "Saving Farm...";

                        const newFarm = await window.apiFetch('/farms/create', {
                            method: 'POST',
                            body: JSON.stringify(farmData)
                        });

                        modal.style.display = "none";
                        fetchWeather(newFarm);
                        alert("Farm registered successfully!");
                    } catch (e) {
                        alert(`Failed to create farm: ${e.message}`);
                    } finally {
                        submitFarmBtn.innerText = originalText;
                        submitFarmBtn.disabled = false;
                    }
                } else {
                    alert("Please fill all required fields including crop type!");
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

    // 4. FARM PAGE LOGIC
    if (document.getElementById("farmsContainer")) {
        if (!profile) window.location.href = "./index.html";
        document.getElementById("userGreeting").innerText = `Hi, ${profile.firstName || profile.username}`;

        const API_BASE_URL = typeof CONFIG !== 'undefined' ? CONFIG.API_BASE_URL : 'https://agro-cast.onrender.com';
        fetch(`${API_BASE_URL}/recommendations/health`).catch(() => {});

        const farmsContainer = document.getElementById("farmsContainer");
        const recModal = document.getElementById("recModal");
        const recModalBody = document.getElementById("recModalBody");
        const recModalTitle = document.getElementById("recModalTitle");

        document.getElementById("closeRecModal").addEventListener("click", () => {
            recModal.style.display = "none";
        });

        const FALLBACK_CROPS = ["Maize", "Rice", "Cassava", "Wheat", "Tomato", "Yam", "Sorghum", "Millet", "Cowpea", "Groundnut", "Soybean", "Plantain"];

        // Open Add Farm modal
        document.getElementById("openAddFarmBtn").addEventListener("click", () => {
            document.getElementById("createFarmModal").style.display = "flex";
            loadCropsForSelect("farmCrop");
        });
        document.getElementById("cancelFarmBtn").addEventListener("click", () => {
            document.getElementById("createFarmModal").style.display = "none";
        });

        async function loadCropsForSelect(selectId) {
            const sel = document.getElementById(selectId);
            if (!sel) return;
            try {
                const resp = await window.apiFetch('/recommendations/crops');
                const list = resp.crops || (Array.isArray(resp) ? resp : []);
                if (list.length > 0) {
                    sel.innerHTML = '<option value="">Select a crop</option>';
                    list.forEach(c => {
                        const o = document.createElement("option");
                        o.value = c.toLowerCase(); o.textContent = c.charAt(0).toUpperCase() + c.slice(1);
                        sel.appendChild(o);
                    });
                } else { throw new Error("empty"); }
            } catch {
                sel.innerHTML = '<option value="">Select a crop</option>';
                FALLBACK_CROPS.forEach(c => { const o = document.createElement("option"); o.value = c.toLowerCase(); o.textContent = c; sel.appendChild(o); });
            }
        }

        // Submit new farm
        document.getElementById("submitFarmBtn").addEventListener("click", async () => {
            const farmName = document.getElementById("farmName").value;
            const farmLocation = document.getElementById("farmLocation").value;
            const farmState = document.getElementById("farmState").value;
            const farmCrop = document.getElementById("farmCrop").value;
            if (!farmName || !farmLocation || !farmState || !farmCrop) { alert("Please fill all required fields!"); return; }
            const btn = document.getElementById("submitFarmBtn");
            btn.innerText = "Finding Location..."; btn.disabled = true;
            try {
                const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(farmLocation)},${encodeURIComponent(farmState)},NG&limit=1&appid=${API_KEY}`;
                const geoRes = await fetch(geoUrl);
                const geoData = await geoRes.json();
                if (!geoData || geoData.length === 0) throw new Error("Location not found. Please check your city/state.");
                const lat = geoData[0].lat, lon = geoData[0].lon;
                if (lat < 4.0 || lat > 14.0 || lon < 2.0 || lon > 15.0) throw new Error("Coordinates outside Nigeria. Enter a valid Nigerian location.");
                btn.innerText = "Saving...";
                await window.apiFetch('/farms/create', { method: 'POST', body: JSON.stringify({ userId: profile.id, name: farmName, location: farmLocation, latitude: lat, longitude: lon, size: 1.0, cropType: farmCrop, state: farmState }) });
                document.getElementById("createFarmModal").style.display = "none";
                alert("Farm registered successfully!");
                if(window.logActivity) window.logActivity({ activityType: 'CREATE', farmName: farmName, cropType: farmCrop, summary: 'Registered a new farm' });
                loadFarms();
            } catch (e) { alert(`Failed: ${e.message}`); }
            finally { btn.innerText = "Save Farm Details"; btn.disabled = false; }
        });

        async function loadFarms() {
            farmsContainer.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Loading your farms...</p></div>`;
            try {
                const farms = await window.apiFetch(`/farms/user/${profile.id}`);
                if (!farms || farms.length === 0) {
                    farmsContainer.innerHTML = `<div class="loading-state"><i class="fas fa-tractor" style="color:#d1fae5;font-size:2.5rem"></i><p>No farms yet. Click "Add Farm" to get started!</p></div>`;
                    return;
                }
                farmsContainer.innerHTML = "";
                farms.forEach(farm => farmsContainer.appendChild(buildFarmCard(farm)));
            } catch (e) {
                farmsContainer.innerHTML = `<div class="loading-state"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
            }
        }

        function buildFarmCard(farm) {
            const card = document.createElement("div");
            card.className = "farm-card";
            card.id = `farm-card-${farm.id}`;
            card.innerHTML = `
                <div class="farm-card-header">
                    <div class="farm-name">${farm.name}</div>
                    <span class="farm-crop-badge">${farm.cropType}</span>
                </div>
                <div class="farm-meta">
                    <div class="farm-meta-item"><i class="fas fa-map-marker-alt"></i>${farm.location}, ${farm.state}</div>
                    <div class="farm-meta-item"><i class="fas fa-ruler-combined"></i>${farm.size || 1} hectare(s)</div>
                </div>
                <div class="farm-actions">
                    <button class="btn-sm btn-primary-sm" onclick="getRecommendations(${farm.id}, '${farm.name}')"><i class="fas fa-robot"></i>Recommendations</button>
                    <button class="btn-sm btn-outline-sm" onclick="toggleEdit(${farm.id})"><i class="fas fa-edit"></i>Edit</button>
                    <button class="btn-sm btn-danger-sm" onclick="deleteFarm(${farm.id})"><i class="fas fa-trash"></i>Delete</button>
                </div>
                <div class="edit-form" id="edit-form-${farm.id}">
                    <div class="input-group"><label>Farm Name</label><input type="text" id="edit-name-${farm.id}" value="${farm.name}"></div>
                    <div class="input-group"><label>Location (City)</label><input type="text" id="edit-location-${farm.id}" value="${farm.location}"></div>
                    <div class="input-group"><label>State</label><input type="text" id="edit-state-${farm.id}" value="${farm.state || ''}"></div>
                    <div class="input-group"><label>Crop</label>
                        <select id="edit-crop-${farm.id}" style="width:100%;padding:12px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-light);font-family:inherit;font-size:1rem;">
                            <option value="${farm.cropType}">${farm.cropType.charAt(0).toUpperCase() + farm.cropType.slice(1)}</option>
                        </select>
                    </div>
                    <button class="btn-sm btn-primary-sm" style="width:100%;justify-content:center;padding:12px;" onclick="saveEdit(${farm.id})"><i class="fas fa-save"></i>Save Changes</button>
                </div>`;
            return card;
        }

        window.toggleEdit = function(farmId) {
            const form = document.getElementById(`edit-form-${farmId}`);
            form.classList.toggle("open");
            if (form.classList.contains("open")) loadCropsForSelect(`edit-crop-${farmId}`);
        };

        window.saveEdit = async function(farmId) {
            const btn = document.querySelector(`#edit-form-${farmId} .btn-primary-sm`);
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; btn.disabled = true;
            try {
                await window.apiFetch('/farms/update', { method: 'PUT', body: JSON.stringify({
                    farmId: farmId,
                    name: document.getElementById(`edit-name-${farmId}`).value,
                    location: document.getElementById(`edit-location-${farmId}`).value,
                    state: document.getElementById(`edit-state-${farmId}`).value,
                    cropType: document.getElementById(`edit-crop-${farmId}`).value,
                })});
                alert("Farm updated successfully!");
                if(window.logActivity) window.logActivity({ activityType: 'UPDATE', farmName: document.getElementById(`edit-name-${farmId}`).value, cropType: document.getElementById(`edit-crop-${farmId}`).value, summary: 'Updated farm profile details' });
                loadFarms();
            } catch(e) { alert(`Failed to update: ${e.message}`); }
            finally { btn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; btn.disabled = false; }
        };

        window.deleteFarm = async function(farmId) {
            if (!confirm("Are you sure you want to delete this farm?")) return;
            try {
                await window.apiFetch(`/farms/${farmId}`, { method: 'DELETE' });
                document.getElementById(`farm-card-${farmId}`)?.remove();
                if(window.logActivity) window.logActivity({ activityType: 'DELETE', farmName: `Farm ID ${farmId}`, summary: 'Deleted farm profile' });
                if (!document.querySelector(".farm-card")) loadFarms();
            } catch(e) { alert(`Failed to delete: ${e.message}`); }
        };

        window.getRecommendations = async function(farmId, farmName) {
            recModalTitle.innerText = `${farmName} — Recommendations`;
            recModalBody.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Analyzing conditions...</p></div>`;
            recModal.style.display = "flex";
            try {
                const data = await window.apiFetch(`/recommendations/farm/${farmId}`);
                if (data && data.success) {
                    if(window.logActivity) window.logActivity({
                        activityType: 'RECOMMENDATION', 
                        farmName: farmName,
                        temperature: data.prediction.conditions.temperature,
                        summary: 'Fetched latest ML crop recommendations'
                    });
                    let html = `<div class="rec-item" style="background:rgba(16,185,129,0.05);border-left:3px solid var(--primary);margin-bottom:14px;">
                        <div style="font-size:0.82rem;color:var(--text-light);margin-bottom:4px;">Conditions</div>
                        <div style="font-size:1.4rem;font-weight:800;">${Math.round(data.prediction.conditions.temperature)}°C</div>
                        <div style="font-size:0.88rem;color:var(--text-main);">Humidity: ${Math.round(data.prediction.conditions.humidity)}% · Rainfall: ${Math.round(data.prediction.conditions.rainfall)}mm</div>
                    </div>`;
                    if (data.summary) html += `<p style="margin-bottom:16px;color:var(--text-main);">${data.summary}</p>`;
                    (data.recommendations || []).forEach(r => {
                        html += `<div class="rec-item priority-${r.priority}"><div class="rec-type">${r.priority} · ${r.type}</div><div class="rec-msg">${r.message}</div></div>`;
                    });
                    recModalBody.innerHTML = html || "<p>No recommendations available.</p>";
                } else { recModalBody.innerHTML = "<p>Could not load recommendations right now.</p>"; }
            } catch(e) { recModalBody.innerHTML = `<p style="color:#ef4444">Error: ${e.message}</p>`; }
        };

        loadFarms();
    }

    // 5. LOGS PAGE LOGIC
    if (document.getElementById("logsContainer")) {
        if (!profile) window.location.href = "./index.html";
        document.getElementById("userGreeting").innerText = `Hi, ${profile.firstName || profile.username}`;

        const logsContainer = document.getElementById("logsContainer");
        let allLogs = [];

        const typeIcons = {
            CREATE: 'fa-plus-circle', RECOMMENDATION: 'fa-robot',
            ANALYSIS: 'fa-chart-bar', READ: 'fa-eye', UPDATE: 'fa-edit', DELETE: 'fa-trash'
        };

        async function loadLogs() {
            logsContainer.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Loading activity logs...</p></div>`;
            try {
                const key = `agrocast_logs_${profile.id}`;
                allLogs = JSON.parse(localStorage.getItem(key)) || [];
                setTimeout(() => renderLogs("ALL"), 300); // Simulate tiny network delay for UI
            } catch(e) {
                logsContainer.innerHTML = `<div class="loading-state"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
            }
        }

        function renderLogs(filter) {
            const filtered = filter === "ALL" ? allLogs : allLogs.filter(l => l.activityType === filter);
            if (!filtered || filtered.length === 0) {
                logsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No ${filter === "ALL" ? "" : filter.toLowerCase() + " "}activity yet.</p></div>`;
                return;
            }
            logsContainer.innerHTML = "";
            filtered.forEach(log => {
                const type = log.activityType || "READ";
                const icon = typeIcons[type] || 'fa-circle';
                const date = log.createdAt ? new Date(log.createdAt).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
                const card = document.createElement("div");
                card.className = "log-card";
                card.innerHTML = `
                    <div class="log-icon-wrap icon-${type}"><i class="fas ${icon}"></i></div>
                    <div class="log-content">
                        <div class="log-header">
                            <span class="log-type-badge type-${type}">${type}</span>
                            <span class="log-date">${date}</span>
                        </div>
                        <div class="log-farm">${log.farmName || 'N/A'}</div>
                        <div class="log-summary">${log.summary || log.recommendations || ''}</div>
                        <div class="log-meta">
                            ${log.cropType ? `<span class="log-meta-chip"><i class="fas fa-seedling"></i>${log.cropType}</span>` : ''}
                            ${log.temperature ? `<span class="log-meta-chip"><i class="fas fa-thermometer-half"></i>${Math.round(log.temperature)}°C</span>` : ''}
                            ${log.yieldAssessment ? `<span class="log-meta-chip"><i class="fas fa-chart-line"></i>${log.yieldAssessment}</span>` : ''}
                        </div>
                    </div>`;
                logsContainer.appendChild(card);
            });
        }

        document.getElementById("filterBar").addEventListener("click", (e) => {
            if (!e.target.classList.contains("filter-chip")) return;
            document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
            e.target.classList.add("active");
            renderLogs(e.target.dataset.filter);
        });

        loadLogs();
    }

});

async function fetchWeather(farm) {
    const locElement = document.getElementById("locationName");
    if (!locElement) return; // not on dashboard

    // First set location name and loading state
    locElement.innerText = farm.name || farm.location;
    document.getElementById("tempText").innerText = `...`;
    document.getElementById("advisory-text").innerText = `Analyzing conditions for ${farm.cropType}...`;

    try {
        // Try to fetch recommendations from backend ML service
        const recData = await window.apiFetch(`/recommendations/farm/${farm.id}`);

        if (recData && recData.success) {
            const conditions = recData.prediction.conditions;
            document.getElementById("tempText").innerText = `${Math.round(conditions.temperature)}°C`;

            let iconCode = '01d';
            if (conditions.rainfall > 10) iconCode = '09d';
            else if (conditions.humidity > 80) iconCode = '04d';

            document.getElementById("weather-icon").src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;

            let advice = recData.summary || `Conditions look good for ${farm.cropType}.`;
            if (recData.recommendations && recData.recommendations.length > 0) {
                const topRec = recData.recommendations.find(r => r.priority === 'HIGH') || recData.recommendations[0];
                advice = `${topRec.type}: ${topRec.message}`;
            }
            document.getElementById("advisory-text").innerText = advice;
            return;
        }
    } catch (e) {
        console.warn("Recommendations API unavailable, falling back to OpenWeatherMap.", e.message);
    }

    // Fallback: use OpenWeatherMap directly with farm coordinates
    try {
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${farm.latitude}&lon=${farm.longitude}&appid=${API_KEY}&units=metric`;
        const weatherRes = await fetch(weatherUrl);
        if (!weatherRes.ok) throw new Error("Weather fetch failed");
        const weatherData = await weatherRes.json();

        const temp = Math.round(weatherData.main.temp);
        const humidity = weatherData.main.humidity;
        const description = weatherData.weather[0].description;
        const iconCode = weatherData.weather[0].icon;

        document.getElementById("tempText").innerText = `${temp}°C`;
        document.getElementById("weather-icon").src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
        document.getElementById("advisory-text").innerText = `${description.charAt(0).toUpperCase() + description.slice(1)}. Humidity: ${humidity}%. Monitor ${farm.cropType} conditions closely.`;
    } catch (err) {
        console.error("Weather fallback also failed:", err);
        document.getElementById("advisory-text").innerText = "Weather data temporarily unavailable. Please check back soon.";
        document.getElementById("tempText").innerText = `--°C`;
    }
}