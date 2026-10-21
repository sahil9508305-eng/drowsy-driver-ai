const videoElement = document.getElementById("webcam");
const canvasElement = document.getElementById("outputCanvas");
const canvasCtx = canvasElement.getContext("2d");

const earValDisplay = document.getElementById("earVal");
const earBar = document.getElementById("earBar");
const frameCounterDisplay = document.getElementById("frameCounter");
const driverStatus = document.getElementById("driverStatus");
const alarmOverlay = document.getElementById("alarmOverlay");
const startBtn = document.getElementById("startBtn");
const calibrateBtn = document.getElementById("calibrateBtn");

let audioCtx = null;
let isMonitoring = false;
let closedFrames = 0;

// Configurations
const EAR_THRESHOLD = 0.22;       // Aankh band detect karne ka cutoff
const MAX_CONSECUTIVE_FRAMES = 25; // ~1.5 - 2 seconds

// MediaPipe 468 Face Landmark Indices for Left & Right Eyes
const LEFT_EYE_LANDMARKS = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE_LANDMARKS = [33, 160, 158, 133, 153, 144];

// Web Audio API Synthesizer Alarm (External MP3 file ki zaroorat nahi)
function triggerAlarmBeep() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880 Hz Loud alert
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.12); // Short pulsing burst
}

function calculateEuclideanDistance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function calculateEAR(landmarks, indices) {
  const p1 = landmarks[indices[0]];
  const p2 = landmarks[indices[1]];
  const p3 = landmarks[indices[2]];
  const p4 = landmarks[indices[3]];
  const p5 = landmarks[indices[4]];
  const p6 = landmarks[indices[5]];

  const vertical1 = calculateEuclideanDistance(p2, p6);
  const vertical2 = calculateEuclideanDistance(p3, p5);
  const horizontal = calculateEuclideanDistance(p1, p4);

  return (vertical1 + vertical2) / (2.0 * horizontal);
}

function onResults(results) {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

    // EAR calculation
    const leftEAR = calculateEAR(landmarks, LEFT_EYE_LANDMARKS);
    const rightEAR = calculateEAR(landmarks, RIGHT_EYE_LANDMARKS);
    const avgEAR = (leftEAR + rightEAR) / 2.0;

    // Telemetry updates
    earValDisplay.innerText = avgEAR.toFixed(3);
    earBar.style.width = `${Math.min(avgEAR * 300, 100)}%`;

    if (avgEAR < EAR_THRESHOLD) {
      closedFrames++;
      frameCounterDisplay.innerText = `${closedFrames} / ${MAX_CONSECUTIVE_FRAMES}`;

      if (closedFrames >= MAX_CONSECUTIVE_FRAMES) {
        // Drowsiness Triggered
        alarmOverlay.classList.remove("hidden");
        driverStatus.innerText = "DROWSY / ASLEEP";
        driverStatus.style.background = "#dc2626";
        driverStatus.style.color = "#ffffff";
        triggerAlarmBeep();
      }
    } else {
      closedFrames = 0;
      frameCounterDisplay.innerText = `0 / ${MAX_CONSECUTIVE_FRAMES}`;
      alarmOverlay.classList.add("hidden");
      driverStatus.innerText = "AWAKE & FOCUSED";
      driverStatus.style.background = "#059669";
      driverStatus.style.color = "#ffffff";
    }
  } else {
    driverStatus.innerText = "NO FACE DETECTED";
    driverStatus.style.background = "#d97706";
    driverStatus.style.color = "#ffffff";
  }
}

// MediaPipe Pipeline initialization
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

startBtn.addEventListener("click", () => {
  if (isMonitoring) return;

  // Browser audio unlock requirement
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await faceMesh.send({ image: videoElement });
    },
    width: 640,
    height: 480
  });

  camera.start();
  isMonitoring = true;
  startBtn.innerText = "Monitoring Running";
  startBtn.style.background = "#059669";
  startBtn.disabled = true;
  calibrateBtn.disabled = false;
  driverStatus.innerText = "CALIBRATING...";
});

calibrateBtn.addEventListener("click", () => {
  triggerAlarmBeep();
});
