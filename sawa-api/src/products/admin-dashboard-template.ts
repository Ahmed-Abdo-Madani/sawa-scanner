export const ADMIN_DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sawa Admin - GTIN Dashboard</title>
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
  
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-tertiary: #334155;
      --accent-color: #6366f1;
      --accent-hover: #4f46e5;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --success-color: #10b981;
      --error-color: #f43f5e;
      --border-color: #475569;
      --glass-bg: rgba(30, 41, 59, 0.7);
      --glass-border: rgba(255, 255, 255, 0.08);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    /* Scrollbars */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: var(--bg-primary);
    }
    ::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--border-color);
    }

    header {
      background: var(--glass-bg);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--glass-border);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-badge {
      background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    }

    header h1 {
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.025em;
    }

    header span {
      background: linear-gradient(135deg, #6366f1, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .auth-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .input-field {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.875rem;
      outline: none;
      transition: all 0.2s ease;
    }

    .input-field:focus {
      border-color: var(--accent-color);
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
    }

    /* Main Dashboard Layout */
    .dashboard-container {
      display: flex;
      flex: 1;
      padding: 1.5rem 2rem;
      gap: 1.5rem;
    }

    /* Sidebar Filters */
    .sidebar {
      width: 320px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .card {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 16px;
      padding: 1.25rem;
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    }

    .card-title {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-main);
      border-bottom: 1px solid rgba(255,255,255,0.05);
      padding-bottom: 0.5rem;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .filter-label {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .select-field {
      width: 100%;
      cursor: pointer;
    }

    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      user-select: none;
      padding: 0.25rem 0;
    }

    .checkbox-group input {
      width: 16px;
      height: 16px;
      accent-color: var(--accent-color);
    }

    .checkbox-label {
      font-size: 0.9rem;
      color: var(--text-main);
    }

    .btn {
      background-color: var(--accent-color);
      color: white;
      border: none;
      padding: 0.625rem 1.25rem;
      border-radius: 8px;
      font-family: inherit;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: all 0.2s ease;
    }

    .btn:hover {
      background-color: var(--accent-hover);
    }

    .btn-secondary {
      background-color: var(--bg-tertiary);
    }
    .btn-secondary:hover {
      background-color: var(--border-color);
    }

    /* Content Area */
    .content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    /* Top stats row */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }

    .stat-card {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .stat-val {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent-color);
    }

    .stat-lbl {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Search & Layout bar */
    .controls-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      padding: 0.75rem 1rem;
    }

    .search-wrapper {
      position: relative;
      flex: 1;
      max-width: 400px;
    }

    .search-wrapper input {
      width: 100%;
      padding-left: 2.5rem;
    }

    .search-icon {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
    }

    .results-meta {
      font-size: 0.875rem;
      color: var(--text-muted);
    }

    /* Product Grid */
    .product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
      flex: 1;
      align-content: start;
    }

    .product-card {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
    }

    .product-card:hover {
      transform: translateY(-4px);
      border-color: rgba(99, 102, 241, 0.4);
      box-shadow: 0 10px 20px rgba(0,0,0,0.3);
    }

    .product-image-container {
      height: 180px;
      background-color: rgba(0,0,0,0.2);
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-bottom: 1px solid var(--glass-border);
    }

    .product-image {
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
      transition: transform 0.3s ease;
    }

    .product-card:hover .product-image {
      transform: scale(1.05);
    }

    .no-image-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-muted);
    }

    .product-multi-badge {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      background: rgba(16, 185, 129, 0.9);
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 20px;
      font-size: 0.7rem;
      font-weight: 600;
      backdrop-filter: blur(4px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .product-info-panel {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex: 1;
    }

    .product-names {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-height: 4.5rem;
    }

    .name-ar {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-main);
      text-align: right;
      direction: rtl;
    }

    .name-en {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .product-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-top: auto;
    }

    .badge {
      font-size: 0.7rem;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      background-color: var(--bg-tertiary);
      color: var(--text-main);
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge-brand {
      background-color: rgba(99, 102, 241, 0.15);
      color: var(--accent-color);
      border: 1px solid rgba(99, 102, 241, 0.25);
    }

    /* GTIN entry controls */
    .gtin-entry-box {
      border-top: 1px solid var(--glass-border);
      padding: 1rem;
      background: rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .gtin-input-wrapper {
      display: flex;
      gap: 0.5rem;
      position: relative;
    }

    .gtin-input-wrapper input {
      flex: 1;
      font-family: monospace;
      font-size: 0.95rem;
      letter-spacing: 0.05em;
      text-align: center;
    }

    .gtin-save-btn {
      width: 42px;
      height: 34px;
      border-radius: 8px;
      background-color: var(--accent-color);
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .gtin-save-btn:hover {
      background-color: var(--accent-hover);
    }

    /* Save animations / feedback */
    .card-status-overlay {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(4px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      z-index: 10;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }

    .card-status-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .spinner {
      width: 30px;
      height: 30px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top: 3px solid var(--accent-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .success-icon-container {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.2);
      border: 2px solid var(--success-color);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--success-color);
      transform: scale(0.8);
      animation: pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }

    @keyframes pop {
      to { transform: scale(1); }
    }

    /* Pagination */
    .pagination-bar {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1.5rem;
      padding: 1.5rem 0;
      margin-top: auto;
    }

    .pagination-info {
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    /* Empty states */
    .empty-state {
      padding: 4rem 2rem;
      text-align: center;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .empty-state i {
      color: var(--accent-color);
    }

    /* Fast-keys reminder */
    .keyboard-shortcut-hint {
      position: fixed;
      bottom: 1rem;
      right: 1.5rem;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--border-color);
      padding: 0.5rem 0.75rem;
      border-radius: 20px;
      font-size: 0.75rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 15px rgba(0,0,0,0.4);
      pointer-events: none;
      z-index: 999;
    }

    .kbd-btn {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 0.1rem 0.3rem;
      font-family: inherit;
      color: var(--text-main);
      font-size: 0.7rem;
      font-weight: 600;
    }
  </style>
</head>
<body>

  <header>
    <div class="logo-container">
      <div class="logo-badge">S</div>
      <h1>Sawa Scanner <span>Admin Dashboard</span></h1>
    </div>
    
    <div class="auth-controls">
      <label class="filter-label" style="margin-right: 0.5rem;">API Secret:</label>
      <input type="password" id="api-secret" class="input-field" placeholder="Admin Secret" value="sawa-scanner-dev-2026">
      <button class="btn btn-secondary" onclick="reloadDashboard()"><i data-lucide="refresh-cw"></i></button>
    </div>
  </header>

  <div class="dashboard-container">
    
    <!-- Sidebar Filters -->
    <aside class="sidebar">
      
      <!-- Statistics Card -->
      <div class="card">
        <h2 class="card-title"><i data-lucide="bar-chart-2"></i> Quick Stats</h2>
        <div class="filter-group">
          <div style="display:flex; justify-content:space-between; margin-bottom: 0.5rem;">
            <span class="filter-label">Products Needing GTIN:</span>
            <span id="stat-pending-count" style="font-weight:600; color:var(--accent-color);">0</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="filter-label">Current Page:</span>
            <span id="stat-current-page" style="font-weight:600;">1</span>
          </div>
        </div>
      </div>

      <!-- Filters Card -->
      <div class="card">
        <h2 class="card-title"><i data-lucide="filter"></i> Filters</h2>
        
        <div class="filter-group">
          <label class="filter-label" for="filter-brand">Brand</label>
          <select id="filter-brand" class="input-field select-field" onchange="applyFilters()">
            <option value="">All Brands</option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label" for="filter-category">Category</label>
          <select id="filter-category" class="input-field select-field" onchange="applyFilters()">
            <option value="">All Categories</option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label" for="filter-status">GTIN Status</label>
          <select id="filter-status" class="input-field select-field" onchange="applyFilters()">
            <option value="unassigned" selected>Needs GTIN (Unassigned)</option>
            <option value="assigned">With GTIN (Assigned)</option>
            <option value="all">All Products</option>
          </select>
        </div>

        <div class="filter-group" style="margin-top: 1rem;">
          <label class="checkbox-group" for="filter-multistore">
            <input type="checkbox" id="filter-multistore" onchange="applyFilters()">
            <span class="checkbox-label">Only Available in Multiple Stores</span>
          </label>
        </div>

        <button class="btn btn-secondary" style="width: 100%; margin-top: 1rem;" onclick="resetFilters()">
          <i data-lucide="rotate-ccw"></i> Reset Filters
        </button>
      </div>

    </aside>

    <!-- Main Content Area -->
    <main class="content-area">
      
      <!-- Top controls & Search -->
      <div class="controls-bar">
        <div class="search-wrapper">
          <i data-lucide="search" class="search-icon"></i>
          <input type="text" id="search-input" class="input-field" placeholder="Search by name, ID or GTIN..." oninput="debounceSearch()">
        </div>
        
        <div class="results-meta">
          Showing <span id="results-count" style="font-weight:600; color:var(--text-main);">0</span> items
        </div>
      </div>

      <!-- Products Grid -->
      <div id="product-list" class="product-grid">
        <!-- Products will load here dynamically -->
      </div>

      <!-- Pagination -->
      <div class="pagination-bar">
        <button class="btn btn-secondary" id="prev-btn" onclick="prevPage()"><i data-lucide="chevron-left"></i> Previous</button>
        <span class="pagination-info">Page <span id="page-num">1</span> of <span id="total-pages">1</span></span>
        <button class="btn btn-secondary" id="next-btn" onclick="nextPage()">Next <i data-lucide="chevron-right"></i></button>
      </div>

    </main>

  </div>

  <!-- Keyboard Shortcuts Hint -->
  <div class="keyboard-shortcut-hint">
    <i data-lucide="keyboard" style="width: 16px; height: 16px;"></i>
    <span>Press <kbd class="kbd-btn">Enter</kbd> to Save & jump to next input</span>
  </div>

  <script>
    let products = [];
    let categories = [];
    let brands = [];
    let currentPage = 1;
    let totalPages = 1;
    const pageSize = 12;
    let searchDebounceTimeout;

    // Initialize Page
    window.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();
      loadFiltersMeta();
      loadProducts();
    });

    function getHeaders() {
      const secret = document.getElementById('api-secret').value;
      return {
        'Content-Type': 'application/json',
        'x-dev-admin-secret': secret
      };
    }

    async function loadFiltersMeta() {
      try {
        const response = await fetch('/admin/products/filters-meta', {
          headers: getHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          categories = data.categories || [];
          brands = data.brands || [];
          populateDropdowns();
        }
      } catch (err) {
        console.error('Failed to load filter metadata:', err);
      }
    }

    function populateDropdowns() {
      const categorySelect = document.getElementById('filter-category');
      const brandSelect = document.getElementById('filter-brand');

      // Clear existing options except first
      categorySelect.innerHTML = '<option value="">All Categories</option>';
      brandSelect.innerHTML = '<option value="">All Brands</option>';

      categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
      });

      brands.forEach(br => {
        const opt = document.createElement('option');
        opt.value = br;
        opt.textContent = br;
        brandSelect.appendChild(opt);
      });
    }

    async function loadProducts() {
      const search = document.getElementById('search-input').value;
      const category = document.getElementById('filter-category').value;
      const brand = document.getElementById('filter-brand').value;
      const status = document.getElementById('filter-status').value;
      const onlyMultiStore = document.getElementById('filter-multistore').checked;

      const url = new URL('/admin/products/needs-gtin', window.location.origin);
      url.searchParams.set('page', currentPage);
      url.searchParams.set('pageSize', pageSize);
      url.searchParams.set('gtinStatus', status);
      if (search) url.searchParams.set('search', search);
      if (category) url.searchParams.set('category', category);
      if (brand) url.searchParams.set('brand', brand);
      if (onlyMultiStore) url.searchParams.set('onlyMultiStore', 'true');

      const container = document.getElementById('product-list');
      container.innerHTML = \`
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="spinner"></div>
          <p>Loading catalog products...</p>
        </div>
      \`;

      try {
        const response = await fetch(url.toString(), {
          headers: getHeaders()
        });

        if (!response.ok) {
          throw new Error(\`Server returned status \${response.status}\`);
        }

        const data = await response.json();
        products = data.items || [];
        const total = data.total || 0;
        
        document.getElementById('results-count').textContent = total;
        document.getElementById('stat-pending-count').textContent = total;
        
        totalPages = Math.ceil(total / pageSize) || 1;
        document.getElementById('page-num').textContent = currentPage;
        document.getElementById('total-pages').textContent = totalPages;
        document.getElementById('stat-current-page').textContent = currentPage;

        renderProducts();
      } catch (err) {
        container.innerHTML = \`
          <div class="empty-state" style="grid-column: 1 / -1; color: var(--error-color);">
            <i data-lucide="alert-circle" style="width: 48px; height: 48px;"></i>
            <h3>Failed to load products</h3>
            <p>\${err.message}</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">Please check if API Server is running and the Admin Secret is correct.</p>
          </div>
        \`;
        lucide.createIcons();
      }
    }

    function renderProducts() {
      const container = document.getElementById('product-list');
      container.innerHTML = '';

      if (products.length === 0) {
        container.innerHTML = \`
          <div class="empty-state" style="grid-column: 1 / -1;">
            <i data-lucide="package-open" style="width: 48px; height: 48px; margin-bottom: 0.5rem;"></i>
            <h3>No products found</h3>
            <p>Try refining your filters or search term.</p>
          </div>
        \`;
        lucide.createIcons();
        return;
      }

      products.forEach((product, index) => {
        const hasImage = product.images && product.images.length > 0;
        const imageUrl = hasImage ? product.images[0].url : '';
        const nameAr = product.name_ar || 'اسم غير متوفر';
        const nameEn = product.name_en || 'English Name Not Available';
        const gtinValue = product.gtin || '';
        const storesBadge = product.priceCount && product.priceCount > 1 
          ? \`<div class="product-multi-badge">\${product.priceCount} Stores</div>\` 
          : '';

        const card = document.createElement('div');
        card.className = 'product-card';
        card.id = \`product-card-\${product.id}\`;
        card.dataset.index = index;

        card.innerHTML = \`
          <!-- Image Section -->
          <div class="product-image-container">
            \${storesBadge}
            \${hasImage 
              ? \`<img class="product-image" src="\${imageUrl}" alt="\${nameEn}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">\` 
              : ''}
            <div class="no-image-placeholder" style="\${hasImage ? 'display:none;' : 'display:flex;'}">
              <i data-lucide="image-off" style="width: 36px; height: 36px;"></i>
              <span style="font-size: 0.75rem;">No Image</span>
            </div>
          </div>

          <!-- Info Section -->
          <div class="product-info-panel">
            <div class="product-names">
              <div class="name-ar">\${nameAr}</div>
              <div class="name-en">\${nameEn}</div>
            </div>

            <div class="product-tags">
              \${product.brand ? \`<span class="badge badge-brand" title="Brand: \${product.brand}">\${product.brand}</span>\` : ''}
              \${product.category ? \`<span class="badge" title="Category: \${product.category}">\${product.category}</span>\` : ''}
              \${product.priceCount ? \`<span class="badge" style="background-color:rgba(16, 185, 129, 0.1); color:var(--success-color);">Prices: \${product.priceCount}</span>\` : ''}
            </div>
          </div>

          <!-- GTIN Entry Section -->
          <div class="gtin-entry-box">
            <label class="filter-label">Assign GTIN</label>
            <div class="gtin-input-wrapper">
              <input type="text" 
                     id="gtin-input-\${product.id}" 
                     class="input-field gtin-input-box" 
                     placeholder="E.g. 6281007..." 
                     value="\${gtinValue}" 
                     maxlength="14"
                     onkeydown="handleGtinKeydown(event, '\${product.id}', \${index})">
              <button class="gtin-save-btn" onclick="saveGtin('\${product.id}', \${index})" title="Save GTIN">
                <i data-lucide="check" style="width: 18px; height: 18px;"></i>
              </button>
            </div>
          </div>

          <!-- Overlay Status (Saving / Success) -->
          <div class="card-status-overlay" id="status-overlay-\${product.id}">
            <div class="spinner" id="status-spinner-\${product.id}"></div>
            <div class="success-icon-container" id="status-success-\${product.id}" style="display:none;">
              <i data-lucide="check-circle-2" style="width: 28px; height: 28px;"></i>
            </div>
            <p id="status-text-\${product.id}" style="font-size: 0.9rem; font-weight:500;">Saving GTIN...</p>
          </div>
        \`;

        container.appendChild(card);
      });

      lucide.createIcons();
    }

    async function saveGtin(productId, index) {
      const input = document.getElementById(\`gtin-input-\${productId}\`);
      const gtin = input.value.trim();

      if (!gtin) {
        alert('Please enter a valid GTIN code');
        return;
      }

      // Show saving spinner overlay
      const overlay = document.getElementById(\`status-overlay-\${productId}\`);
      const spinner = document.getElementById(\`status-spinner-\${productId}\`);
      const successIcon = document.getElementById(\`status-success-\${productId}\`);
      const text = document.getElementById(\`status-text-\${productId}\`);

      text.textContent = 'Saving GTIN...';
      spinner.style.display = 'block';
      successIcon.style.display = 'none';
      overlay.classList.add('active');

      try {
        const response = await fetch(\`/admin/products/\${productId}/assign-gtin\`, {
          method: 'PATCH',
          headers: getHeaders(),
          body: JSON.stringify({ gtin })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || 'Failed to assign GTIN');
        }

        // Show Success Checkmark
        spinner.style.display = 'none';
        successIcon.style.display = 'flex';
        text.textContent = 'GTIN Assigned!';
        
        lucide.createIcons({
          name: 'check-circle-2',
          attrs: { style: 'width: 28px; height: 28px;' }
        });

        // Keep success message visible for 1s, then hide card or reset
        setTimeout(() => {
          overlay.classList.remove('active');
          
          // If we are showing "Unassigned" products, we should remove the card
          const statusFilter = document.getElementById('filter-status').value;
          if (statusFilter === 'unassigned') {
            const cardElement = document.getElementById(\`product-card-\${productId}\`);
            cardElement.style.transform = 'scale(0.8)';
            cardElement.style.opacity = '0';
            setTimeout(() => {
              cardElement.remove();
              // Adjust count
              const countBadge = document.getElementById('results-count');
              const currentCount = parseInt(countBadge.textContent);
              if (currentCount > 0) {
                countBadge.textContent = currentCount - 1;
                document.getElementById('stat-pending-count').textContent = currentCount - 1;
              }
            }, 300);
          }
        }, 1000);

      } catch (err) {
        overlay.classList.remove('active');
        alert(\`Error: \${err.message}\`);
      }
    }

    // Keyboard focus navigation helper (Press Enter to save & jump to next card)
    function handleGtinKeydown(event, productId, index) {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveGtin(productId, index);

        // Find next card and focus its input
        const nextCard = document.querySelector(\`.product-card[data-index="\${index + 1}"]\`);
        if (nextCard) {
          const nextInput = nextCard.querySelector('.gtin-input-box');
          if (nextInput) {
            setTimeout(() => {
              nextInput.focus();
              nextInput.select();
            }, 1100); // Wait for the save animation to clear
          }
        }
      }
    }

    // Filter Controls
    function applyFilters() {
      currentPage = 1;
      loadProducts();
    }

    function resetFilters() {
      document.getElementById('filter-brand').value = '';
      document.getElementById('filter-category').value = '';
      document.getElementById('filter-status').value = 'unassigned';
      document.getElementById('filter-multistore').checked = false;
      document.getElementById('search-input').value = '';
      currentPage = 1;
      loadProducts();
    }

    function debounceSearch() {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = setTimeout(() => {
        currentPage = 1;
        loadProducts();
      }, 400);
    }

    function reloadDashboard() {
      loadFiltersMeta();
      loadProducts();
    }

    // Pagination Controls
    function prevPage() {
      if (currentPage > 1) {
        currentPage--;
        loadProducts();
      }
    }

    function nextPage() {
      if (currentPage < totalPages) {
        currentPage++;
        loadProducts();
      }
    }
  </script>
</body>
</html>
`;
