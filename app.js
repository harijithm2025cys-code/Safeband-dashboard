// SafeBand v2 frontend starter. All values below are simulated demo data.
const demo = {
  heartRate: [72, 76, 79, 74, 81, 75, 77],
  spo2: [97, 98, 99, 98, 97, 98],
  battery: [84, 83, 82, 85, 81, 84],
  movement: ["Low", "Normal", "Low", "Normal"]
};

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

document.getElementById("refresh-button").addEventListener("click", () => {
  document.getElementById("heart-rate").textContent = pick(demo.heartRate);
  document.getElementById("spo2").textContent = pick(demo.spo2);
  document.getElementById("battery").textContent = pick(demo.battery);
  document.getElementById("movement").textContent = pick(demo.movement);
  document.getElementById("battery-bar").style.width =
    document.getElementById("battery").textContent + "%";

  const now = new Date();
  document.getElementById("event-time").textContent =
    "Preview refreshed at " + now.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
});

// This is a frontend-only preview. Connect Firebase before using real device data.
// Do not use simulated values for medical or emergency decisions.
