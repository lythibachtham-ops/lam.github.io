// ==========================================
// CẤU HÌNH & DỮ LIỆU HỆ THỐNG
// ==========================================
const CONFIG = {
  EXPIRE_TIME_MS: 15 * 60 * 1000, // 15 phút
  COLORS: {
    free: '#22c55e',   // Xanh lá (Trống nhiều)
    warning: '#f59e0b',// Vàng (Đang đầy)
    full: '#ef4444',   // Đỏ (Sắp đầy/Quá tải)
    route: '#0ea5e9',  // Xanh Cyan (Đường đi)
    text: '#ffffff',   // Chữ trắng
    stroke: '#0f172a'  // Viền Navy
  }
};

const parkingLots = [
  { id: 'lot1', name: 'Sân chính', x: 50, y: 120, width: 471, height: 128, capacity: 800, bookings: 0 },
  { id: 'lot2', name: 'Bãi Cổng phụ', x: 609, y: 170, width: 109, height: 140, capacity: 200, bookings: 0 },
  { id: 'lot3', name: 'Bãi đỗ xe C', x: 532, y: 0, width: 218, height: 81, capacity: 150, bookings: 0 },
  { id: 'lot4', name: 'Bãi đỗ xe trước', x: 216, y: 419, width: 218, height: 81, capacity: 150, bookings: 0 }
];

const gates = [
  { name: 'Cổng chính', x: 0, y: 429, image: 'images/gate_main.jpg', width: 71, height: 71 },
  { name: 'Cổng phụ', x: 679, y: 429, image: 'images/gate_sub.jpg', width: 71, height: 61 },
  { name: 'Cổng sau', x: 417, y: 0, image: 'images/gate_back.jpg', width: 71, height: 71 }
];

const routes = {
  'lot1': [{ x: 0, y: 581 }, { x: 50, y: 120 }],
  'lot2': [{ x: 750, y: 490 }, { x: 718, y: 310 }],
  'lot3': [{ x: 417, y: 0 }, { x: 417, y: 8 }, { x: 750, y: 8 }],
  'lot4': [{ x: 0, y: 581 }, { x: 216, y: 419 }]
};

// ==========================================
// QUẢN LÝ TRẠNG THÁI (STATE)
// ==========================================
let bookings = JSON.parse(localStorage.getItem('uth_bookings')) || [];
let selectedLotId = null;
let blinkState = true;
let blinkInterval = null;
let expireInterval = null;

// Cache DOM Elements để tăng hiệu năng (Không gọi DOM nhiều lần)
const DOM = {
  canvas: document.getElementById('map'),
  ctx: document.getElementById('map')?.getContext('2d'),
  tooltip: document.getElementById('tooltip'),
  status: document.getElementById('status'),
  suggestion: document.getElementById('suggestion'),
  altSuggestion: document.getElementById('altSuggestion'),
  altDetail: document.getElementById('alternative-detail'),
  modal: document.getElementById('parking-modal'),
  lotSelect: document.getElementById('parking-lot'),
  plateInput: document.getElementById('plate-number'),
  arrivalTime: document.getElementById('arrival-time'),
  loginSec: document.getElementById('login-section'),
  mainSec: document.getElementById('main-section'),
  studentId: document.getElementById('studentId'),
  password: document.getElementById('password')
};

// ==========================================
// KHỞI TẠO DỮ LIỆU DỰ ĐOÁN
// ==========================================
const parkingDataByTime = (function generateDynamicData() {
  const data = {};
  for (let t = 8 * 60; t <= 16 * 60; t += 15) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    const label = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    
    let a = Math.min(800, Math.floor(Math.random() * 801));
    let b = Math.min(200, Math.floor(Math.random() * 201));
    let c = Math.min(150, Math.floor(Math.random() * 151));
    let d = Math.min(150, Math.floor(Math.random() * 151));
    
    if (["14:30", "14:45"].includes(label)) a = b = c = d = 1000;
    else if (label === "15:00") { a = 780; b = 180; c = d = 140; }
    
    data[label] = [
      { name: "Sân chính", capacity: 800, current: a },
      { name: "Cổng Phụ", capacity: 200, current: b },
      { name: "Bãi giữ xe C", capacity: 150, current: c },
      { name: "Bãi đỗ xe trước", capacity: 150, current: d }
    ];
  }
  return data;
})();

// ==========================================
// HÀM XỬ LÝ GIAO DIỆN & LOGIC
// ==========================================
function updateUIFeedback(totalBookings) {
  // 1. Cập nhật gợi ý thời gian
  if (DOM.suggestion) {
    if (totalBookings <= 300) DOM.suggestion.innerHTML = "✔️ Đây là thời điểm lý tưởng để gửi xe!";
    else if (totalBookings <= 600) DOM.suggestion.innerHTML = "⚠️ Bãi xe đang dần đầy, nên tranh thủ!";
    else DOM.suggestion.innerHTML = "🔴 Bãi xe sắp quá tải, nên cân nhắc gửi ngoài!";
  }

  // 2. Cập nhật gợi ý thay thế
  if (totalBookings > 1000) {
    if (DOM.altSuggestion) DOM.altSuggestion.innerHTML = "🛑 Vượt quá giới hạn! Khuyên dùng bãi ngoài.";
    DOM.altDetail?.classList.remove("hidden");
  } else {
    DOM.altDetail?.classList.add("hidden");
  }
}

function hideAlternativeDetail() {
  DOM.altDetail?.classList.add("hidden");
}

function syncBookingsToLots() {
  // Cập nhật lại số lượng xe đã đặt vào bãi (Dùng khi F5 trang)
  parkingLots.forEach(lot => lot.bookings = 0);
  bookings.forEach(b => {
    const lot = parkingLots.find(l => l.id === b.lotId);
    if (lot) lot.bookings++;
  });
}

// ==========================================
// VẼ BẢN ĐỒ (CANVAS)
// ==========================================
function drawMap() {
  if (DOM.modal?.classList.contains("hidden") || !DOM.ctx) return;

  const { canvas, ctx } = DOM;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Vẽ bãi xe
  parkingLots.forEach(lot => {
    const ratio = lot.bookings / lot.capacity;
    ctx.fillStyle = ratio > 0.8 ? CONFIG.COLORS.full : ratio > 0.5 ? CONFIG.COLORS.warning : CONFIG.COLORS.free;
    
    // Đổ bóng cho bãi xe
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 5;
    ctx.fillRect(lot.x, lot.y, lot.width, lot.height);
    
    // Viền bãi xe
    ctx.shadowBlur = 0; // Tắt bóng cho viền và chữ
    ctx.strokeStyle = CONFIG.COLORS.stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(lot.x, lot.y, lot.width, lot.height);

    // Text hiển thị
    ctx.fillStyle = CONFIG.COLORS.text;
    ctx.font = "bold 14px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${lot.name} (${lot.bookings}/${lot.capacity})`, lot.x + lot.width / 2, lot.y + lot.height / 2);
  });

  // 2. Vẽ cổng
  gates.forEach(gate => {
    const img = new Image();
    img.src = gate.image;
    img.onload = () => ctx.drawImage(img, gate.x, gate.y, gate.width, gate.height);
    img.onerror = () => { // Fallback nếu lỗi ảnh
      ctx.fillStyle = '#64748b';
      ctx.fillRect(gate.x, gate.y, gate.width, gate.height);
    };
  });

  // 3. Vẽ tuyến đường nhấp nháy
  if (selectedLotId && routes[selectedLotId]) {
    ctx.strokeStyle = blinkState ? CONFIG.COLORS.route : "transparent";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    routes[selectedLotId].forEach((pt, i) => {
      i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
  }
}

// ==========================================
// TÍNH NĂNG ĐẶT / HỦY CHỖ
// ==========================================
function saveBookings() {
  localStorage.setItem('uth_bookings', JSON.stringify(bookings));
  const total = parkingLots.reduce((sum, l) => sum + l.bookings, 0);
  updateUIFeedback(total);
}

function bookParking() {
  if (localStorage.getItem('loggedIn') !== 'true') return alert('Vui lòng đăng nhập để đặt chỗ!');
  if (!selectedLotId) return alert("Vui lòng chọn bãi xe trên bản đồ hoặc danh sách!");
  
  const plate = DOM.plateInput.value.trim();
  if (!plate) return alert("Vui lòng nhập biển số xe hợp lệ!");

  const lot = parkingLots.find(l => l.id === selectedLotId);
  const maxAllow = lot.capacity * 0.8; // Giới hạn 80%

  if (lot.bookings >= maxAllow) {
    const alternatives = parkingLots.filter(l => l.bookings < l.capacity * 0.8).map(l => l.name).join(', ');
    DOM.status.innerHTML = `<span style="color: ${CONFIG.COLORS.full}">🛑 <strong>${lot.name}</strong> đã vượt giới hạn 80%. Bãi khả dụng: ${alternatives || 'Hết chỗ'}.</span>`;
    return;
  }

  // Kiểm tra xem biển số này đã đặt chưa (Tránh spam)
  if (bookings.some(b => b.plate === plate)) {
    return alert("Biển số xe này đã được đặt chỗ rồi!");
  }

  lot.bookings++;
  bookings.push({ lotId: lot.id, timestamp: Date.now(), plate });
  
  DOM.status.innerHTML = `<span style="color: ${CONFIG.COLORS.free}">✅ Đặt chỗ thành công tại <strong>${lot.name}</strong> cho xe <strong>${plate}</strong>.</span>`;
  
  saveBookings();
  drawMap();
}

function cancelBooking() {
  if (localStorage.getItem('loggedIn') !== 'true') return alert('Vui lòng đăng nhập!');
  
  const lot = parkingLots.find(l => l.id === selectedLotId);
  if (!lot) return alert("Vui lòng chọn bãi xe cần hủy!");

  // Lấy xe đặt gần nhất của user tại bãi này (Thực tế nên hủy theo biển số, nhưng ta làm đơn giản)
  const index = bookings.findLastIndex(b => b.lotId === lot.id);
  
  if (index === -1) {
    DOM.status.innerHTML = `<span style="color: ${CONFIG.COLORS.warning}">⚠️ Không tìm thấy lượt đặt chỗ của bạn tại ${lot.name}!</span>`;
    return;
  }

  const removed = bookings.splice(index, 1)[0];
  lot.bookings--;
  
  DOM.status.innerHTML = `<span>🗑️ Hủy thành công xe <strong>${removed.plate}</strong> tại <strong>${lot.name}</strong>.</span>`;
  saveBookings();
  drawMap();
}

function predictParking() {
  if (localStorage.getItem('loggedIn') !== 'true') return alert('Vui lòng đăng nhập!');
  
  const time = DOM.arrivalTime.value;
  if (!time) return alert("Vui lòng chọn thời gian đến!");
  
  const d = new Date(time);
  const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  const data = parkingDataByTime[label];
  
  if (!data) return alert("Không có dữ liệu cho khung giờ này!");

  parkingLots.forEach(lot => {
    const entry = data.find(l => l.name === lot.name);
    lot.bookings = entry ? entry.current : 0;
  });
  
  DOM.status.innerHTML = `📊 Đang hiển thị dự đoán tình trạng bãi lúc <strong>${label}</strong>.`;
  saveBookings();
  drawMap();
}

// ==========================================
// TƯƠNG TÁC SỰ KIỆN BẢN ĐỒ & DROPDOWN
// ==========================================
function getMousePos(evt) {
  const rect = DOM.canvas.getBoundingClientRect();
  const scaleX = DOM.canvas.width / rect.width;
  const scaleY = DOM.canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY
  };
}

DOM.canvas?.addEventListener('click', e => {
  const pos = getMousePos(e);
  parkingLots.forEach(lot => {
    if (pos.x >= lot.x && pos.x <= lot.x + lot.width && pos.y >= lot.y && pos.y <= lot.y + lot.height) {
      selectedLotId = lot.id;
      if (DOM.lotSelect) DOM.lotSelect.value = lot.id;
      drawMap();
    }
  });
});

DOM.lotSelect?.addEventListener('change', e => {
  selectedLotId = e.target.value || null;
  drawMap();
});

DOM.canvas?.addEventListener('mousemove', e => {
  if (!DOM.tooltip) return;
  const pos = getMousePos(e);
  let found = false;

  parkingLots.forEach(lot => {
    if (pos.x >= lot.x && pos.x <= lot.x + lot.width && pos.y >= lot.y && pos.y <= lot.y + lot.height) {
      const percent = ((lot.bookings / lot.capacity) * 100).toFixed(1);
      
      DOM.tooltip.style.display = 'block';
      DOM.tooltip.style.left = `${e.clientX + 15}px`;
      DOM.tooltip.style.top = `${e.clientY + 15}px`;
      
      // Inline style tooltips đẹp hơn
      DOM.tooltip.style.cssText = `
        display: block; position: fixed; left: ${e.clientX + 15}px; top: ${e.clientY + 15}px;
        background: rgba(15, 23, 42, 0.9); color: white; padding: 10px 15px;
        border-radius: 8px; font-size: 13px; z-index: 1000; pointer-events: none;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2);
      `;
      DOM.tooltip.innerHTML = `<strong>${lot.name}</strong><br>Trống: ${Math.max(0, lot.capacity - lot.bookings)}<br>Tỷ lệ đầy: ${percent}%`;
      found = true;
    }
  });
  if (!found) DOM.tooltip.style.display = 'none';
});

// ==========================================
// XÁC THỰC (AUTH)
// ==========================================
function login() {
  const id = DOM.studentId.value.trim();
  const pw = DOM.password.value;
  if (!id || !pw) return alert("Vui lòng nhập đầy đủ thông tin.");
  
  localStorage.setItem("loggedIn", "true");
  DOM.loginSec?.classList.add("hidden");
  DOM.mainSec?.classList.remove("hidden");
}

function logout() {
  localStorage.removeItem("loggedIn");
  localStorage.removeItem("uth_bookings"); // Xóa lịch sử đặt chỗ khi đăng xuất
  bookings = [];
  syncBookingsToLots();
  
  DOM.studentId.value = "";
  DOM.password.value = "";
  DOM.mainSec?.classList.add("hidden");
  DOM.loginSec?.classList.remove("hidden");
  hideAlternativeDetail();
}

// ==========================================
// ĐIỀU KHIỂN MODAL & TIỆN ÍCH
// ==========================================
function showParkingModal() {
  if (localStorage.getItem("loggedIn") !== "true") return alert("Vui lòng đăng nhập trước!");
  DOM.modal?.classList.remove("hidden");
  
  // Khởi động các vòng lặp khi mở Modal
  if (!blinkInterval) {
    blinkInterval = setInterval(() => {
      if (DOM.modal?.classList.contains("hidden") || !selectedLotId) return;
      blinkState = !blinkState;
      drawMap();
    }, 500);
  }
  drawMap();
}

function closeParkingModal() {
  DOM.modal?.classList.add("hidden");
  selectedLotId = null;
  if (DOM.lotSelect) DOM.lotSelect.value = "";
  if (DOM.status) DOM.status.innerHTML = "";
  if (DOM.plateInput) DOM.plateInput.value = "";
  hideAlternativeDetail();
}

// Xử lý hết hạn đặt chỗ (Chạy ngầm)
function checkExpirations() {
  const now = Date.now();
  const originalLength = bookings.length;
  
  // Lọc ra các booking còn hạn
  bookings = bookings.filter(b => now - b.timestamp <= CONFIG.EXPIRE_TIME_MS);
  
  if (bookings.length !== originalLength) {
    syncBookingsToLots();
    saveBookings();
    if (!DOM.modal?.classList.contains("hidden")) drawMap();
  }
}

// ==========================================
// KHỞI CHẠY (INIT)
// ==========================================
window.onload = function () {
  if (localStorage.getItem("loggedIn") === "true") {
    DOM.loginSec?.classList.add("hidden");
    DOM.mainSec?.classList.remove("hidden");
  }
  
  syncBookingsToLots();
  saveBookings();
  hideAlternativeDetail();
  
  // Bật bộ đếm kiểm tra hết hạn (1 phút chạy 1 lần)
  expireInterval = setInterval(checkExpirations, 60000);
};