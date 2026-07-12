// ==== DỮ LIỆU HỆ THỐNG ====
const parkingLots = [
  { id: 'lot1', name: 'Sân chính', x: 50, y: 120, width: 471, height: 128, capacity: 800, bookings: 0 },
  { id: 'lot2', name: 'Bãi Cổng phụ', x: 609, y: 170, width: 109, height: 140, capacity: 200, bookings: 0 },
  { id: 'lot3', name: 'Bãi đỗ xe C', x: 532, y: 0, width: 218, height: 81, capacity: 150, bookings: 0 },
  { id: 'lot4', name: 'Bãi đỗ xe trước', x: 216, y: 419, width: 218, height: 81, capacity: 150, bookings: 0 }
];

const gates = [
  { name: 'Cổng chính', x: 0, y: 429, image: 'gate_main.jpg', width: 71, height: 71 },
  { name: 'Cổng phụ', x: 679, y: 429, image: 'gate_sub.jpg', width: 71, height: 61 },
  { name: 'Cổng sau', x: 417, y: 0, image: 'gate_back.jpg', width: 71, height: 71 }
];

const routes = {
  'lot1': [{ x: 0, y: 581 }, { x: 50, y: 120 }],
  'lot2': [{ x: 750, y: 490 }, { x: 718, y: 310 }],
  'lot3': [{ x: 417, y: 0 }, { x: 417, y: 8 }, { x: 750, y: 8 }],
  'lot4': [{ x: 0, y: 581 }, { x: 216, y: 419 }]
};

const bookings = [];
let selectedLotId = null;
let blinkState = true;
// const canvas = document.getElementById('map');
// const ctx = canvas?.getContext('2d');
const tooltip = document.getElementById('tooltip');

// ==== DỮ LIỆU DỰ ĐOÁN ====
function getFutureTime(label, mins) {
  const [h, m] = label.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`;
}

function estimateFullTime(current, cap, label) {
  const percent = (current / cap) * 100;
  if (percent >= 100) return label;
  if (percent >= 90) return getFutureTime(label, 30);
  if (percent >= 80) return getFutureTime(label, 60);
  if (percent >= 70) return getFutureTime(label, 90);
  if (percent >= 50) return getFutureTime(label, 120);
  return getFutureTime(label, 180);
}

function generateDynamicData() {
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
      { name: "Sân chính", capacity: 800, current: a, fullTime: estimateFullTime(a, 800, label) },
      { name: "Cổng Phụ", capacity: 200, current: b, fullTime: estimateFullTime(b, 200, label) },
      { name: "Bãi giữ xe C", capacity: 150, current: c, fullTime: estimateFullTime(c, 150, label) },
      { name: "Bãi đỗ xe trước", capacity: 150, current: d, fullTime: estimateFullTime(d, 150, label) }
    ];
  }
  return data;
}
const parkingDataByTime = generateDynamicData();

// ==== GỢI Ý + CẢNH BÁO ====
function suggestTime(count) {
  const suggestion = document.getElementById('suggestion');
  if (!suggestion) return;
  if (count <= 300) suggestion.innerHTML = "✔️ Đây là thời điểm lý tưởng để gửi xe!";
  else if (count <= 600) suggestion.innerHTML = "⚠️ Bãi xe đang dần đầy, nên tranh thủ!";
  else suggestion.innerHTML = "🔴 Bãi xe sắp quá tải, nên cân nhắc gửi!";
}

function checkCapacity(total) {
  const alt = document.getElementById('altSuggestion');
  const detail = document.getElementById('alternative-detail');

  if (alt && total > 1000) {
    alt.innerHTML = "🛑 Vượt quá giới hạn! Hiện chỉ còn gợi ý gửi xe ngoài trường.";
    if (detail) detail.classList.remove("hidden"); // hiện thêm nội dung
  } else {
    if (detail) detail.classList.add("hidden"); // ẩn lại nếu không đủ điều kiện
  }
}
// ==== ẨN PHẦN GỢI Ý THAY THẾ KHI CẦN ====
function hideAlternativeDetail() {
  const detail = document.getElementById('alternative-detail');
  if (detail) detail.classList.add("hidden");
}

// ==== VẼ BẢN ĐỒ ====
function drawMap() {
  const modal = document.getElementById("parking-modal");
  if (modal?.classList.contains("hidden")) return;

  const canvas = document.getElementById('map');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  parkingLots.forEach(lot => {
    const r = lot.bookings / lot.capacity;
    ctx.fillStyle = r > 0.8 ? 'red' : r > 0.5 ? 'yellow' : 'green';
    ctx.fillRect(lot.x, lot.y, lot.width, lot.height);
    ctx.fillStyle = r > 0.5 ? 'black' : 'white';
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${lot.name} (${lot.bookings}/${lot.capacity})`, lot.x + lot.width / 2, lot.y + lot.height / 2);
  });

  gates.forEach(gate => {
    const img = new Image();
    img.src = gate.image;
    img.onload = () => ctx.drawImage(img, gate.x, gate.y, gate.width, gate.height);
    img.onerror = () => {
      ctx.fillStyle = 'gray';
      ctx.fillRect(gate.x, gate.y, gate.width, gate.height);
    };
  });

  if (selectedLotId && routes[selectedLotId]) {
    ctx.strokeStyle = blinkState ? "yellow" : "#ffeb3b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    routes[selectedLotId].forEach((pt, i) => {
      i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
  }
}

setInterval(() => {
  const modal = document.getElementById("parking-modal");
  const canvas = document.getElementById("map");
  const ctx = canvas?.getContext("2d");
  if (modal?.classList.contains("hidden") || !ctx || !selectedLotId) return;
  blinkState = !blinkState;
  drawMap();
}, 500);
// ==== ĐẶT CHỖ ====
function bookParking() {
  if (localStorage.getItem('loggedIn') !== 'true') {
    alert('Vui lòng đăng nhập để đặt chỗ!');
    return;
  }
  if (!selectedLotId) return alert("Vui lòng chọn bãi xe trước!");
  const lot = parkingLots.find(l => l.id === selectedLotId);
const plate = document.getElementById("plate-number").value.trim(); // ✅ Lấy biển số

  if (!plate) return alert("Vui lòng nhập biển số xe!");

  const status = document.getElementById('status');
  const max = lot.capacity * 0.8;

  if (lot.bookings >= max) {
    const alternatives = parkingLots
      .filter(l => l.bookings < l.capacity * 0.8)
      .map(l => l.name)
      .join(', ');
    status.textContent = `${lot.name} đã vượt giới hạn 80%. Hãy chọn: ${alternatives || 'không còn bãi trống'}.`;
    return;
  }
  lot.bookings++;
   bookings.push({ lotId: lot.id, timestamp: Date.now(), plate }); // ✅ Lưu biển số

  status.textContent = `✅ Đặt chỗ thành công tại ${lot.name} cho xe ${plate}.`;
  suggestTime(bookings.length);
  checkCapacity(bookings.length);
  drawMap();
}

// ==== HỦY CHỖ ====
function cancelBooking() {
  if (localStorage.getItem('loggedIn') !== 'true') {
    alert('Vui lòng đăng nhập để hủy đặt chỗ!');
    return;
  }
  const lot = parkingLots.find(l => l.id === selectedLotId);
  const status = document.getElementById('status');
  const index = bookings.findIndex(b => b.lotId === lot.id);
  if (index === -1) {
    status.textContent = `Không có đặt chỗ nào tại ${lot.name}!`;
    return;
  }
  bookings.splice(index, 1);
  lot.bookings--;
  status.textContent = `🗑️ Hủy thành công tại ${lot.name}.`;
  suggestTime(bookings.length);
  checkCapacity(bookings.length);
  drawMap();
}

// ==== DỰ ĐOÁN ====
function predictParking() {
  if (localStorage.getItem('loggedIn') !== 'true') {
    alert('Vui lòng đăng nhập để dự đoán!');
    return;
  }
  const time = document.getElementById("arrival-time").value;
  if (!time) return;
  const d = new Date(time);
  const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  const data = parkingDataByTime[label];
  parkingLots.forEach(lot => {
    const entry = data?.find(l => l.name === lot.name);
    lot.bookings = entry ? entry.current : 0;
  });
  const total = parkingLots.reduce((sum, l) => sum + l.bookings, 0);
  suggestTime(total);
  checkCapacity(total);
  drawMap();
}

// ==== TOOLTIP & CHỌN ====
document.getElementById("map")?.addEventListener('click', e => {
  const canvas = document.getElementById("map");
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  parkingLots.forEach(lot => {
    if (x >= lot.x && x <= lot.x + lot.width && y >= lot.y && y <= lot.y + lot.height) {
      selectedLotId = lot.id;
      document.getElementById('parking-lot').value = lot.id;
      drawMap();
    }
  });
});

document.getElementById("map")?.addEventListener('mousemove', e => {
if (!tooltip) return;
  const rect = e.target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  let found = false;
  parkingLots.forEach(lot => {
    if (x >= lot.x && x <= lot.x + lot.width && y >= lot.y && y <= lot.y + lot.height) {
      const percent = ((lot.bookings / lot.capacity) * 100).toFixed(1);
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.clientX + 10}px`;
      tooltip.style.top = `${e.clientY + 10}px`;
      tooltip.innerHTML = `${lot.name}<br>Chỗ trống: ${lot.capacity - lot.bookings}<br>Tỷ lệ: ${percent}%`;
      found = true;
    }
  });
  if (!found) tooltip.style.display = 'none';
});

// ==== LOGIN ====
function login() {
  const id = document.getElementById("studentId").value;
  const pw = document.getElementById("password").value;
  if (!id || !pw) return alert("Vui lòng nhập đầy đủ.");
  localStorage.setItem("loggedIn", "true");
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("main-section").classList.remove("hidden");
  alert(`Chào mừng ${id}!`);
}

function logout() {
  localStorage.removeItem("loggedIn");
  document.getElementById("main-section").classList.add("hidden");
  document.getElementById("login-section").classList.remove("hidden");
hideAlternativeDetail(); // 👈 Thêm dòng này để ẩn khi đăng xuất
}

// ==== MODAL ====
function showParkingModal() {
  if (localStorage.getItem("loggedIn") !== "true") {
    alert("Vui lòng đăng nhập để đặt chỗ!");
    return;
  }
  document.getElementById("parking-modal").classList.remove("hidden");
  drawMap();
}

function closeParkingModal() {
  document.getElementById("parking-modal").classList.add("hidden");
  selectedLotId = null;
  drawMap();
hideAlternativeDetail(); // 👈 Thêm dòng này
}

// ==== GIỜ CAO ĐIỂM ====
function showTrafficTime() {
  alert("Giờ cao điểm là 9h30, 12h10, 14h40. Cập nhật theo thời gian thực.");
}

// ==== HẾT HẠN ĐẶT CHỖ ====
setInterval(() => {
  const now = Date.now();
  const expired = bookings.filter(b => now - b.timestamp > 15 * 60 * 1000);
  expired.forEach(b => {
    const lot = parkingLots.find(l => l.id === b.lotId);
    if (lot) lot.bookings--;
  });
  const validBookings = bookings.filter(b => now - b.timestamp <= 15 * 60 * 1000);
  bookings.length = 0;
  bookings.push(...validBookings);
  const total = parkingLots.reduce((sum, lot) => sum + lot.bookings, 0);
  suggestTime(total);
  checkCapacity(total);
  drawMap();
}, 60000); // mỗi phút

// ==== KHI LOAD ====
window.onload = function () {
  if (localStorage.getItem("loggedIn") === "true") {
    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("main-section").classList.remove("hidden");
  }

hideAlternativeDetail(); // ✅ Dòng này thêm vào cuối
  // Không gọi drawMap() ở đây nữa!
};
