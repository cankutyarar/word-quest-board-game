import { supabase } from "./supabaseClient.js";
import { renderTopbar, COLORS, genJoinCode, qs } from "./main.js";

document.getElementById("topbar").innerHTML = renderTopbar();

const boardNumber = Number(qs("board")) || 1;
let session = null;
let selectedColor = null;
let takenColors = new Set();

async function init() {
  const { data: board } = await supabase.from("boards").select("*").eq("board_number", boardNumber).single();
  document.getElementById("boardNameLabel").textContent = board ? board.name : `Board ${boardNumber}`;

  const existingCode = qs("session");
  if (existingCode) {
    await loadSessionByCode(existingCode);
  }
}

async function loadSessionByCode(code) {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("join_code", code.toUpperCase())
    .single();
  if (error || !data) {
    document.getElementById("sessionMsg").textContent = "No game found with that code.";
    return;
  }
  session = data;
  showNameCard();
  subscribeToTaken();
}

document.getElementById("startBtn").addEventListener("click", async () => {
  const { data: board } = await supabase.from("boards").select("*").eq("board_number", boardNumber).single();
  const join_code = genJoinCode();
  const { data, error } = await supabase
    .from("game_sessions")
    .insert({ board_id: board.id, join_code, status: "waiting", current_turn_order: 0 })
    .select()
    .single();
  if (error) {
    document.getElementById("sessionMsg").textContent = error.message;
    return;
  }
  session = data;
  showNameCard();
  subscribeToTaken();
});

document.getElementById("joinCodeBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  if (!code) return;
  await loadSessionByCode(code);
});

function showNameCard() {
  document.getElementById("sessionCard").classList.add("hidden");
  document.getElementById("nameCard").classList.remove("hidden");
  document.getElementById("codeDisplay").textContent = session.join_code;
  renderColorGrid();
}

async function refreshTaken() {
  const { data } = await supabase.from("players").select("color").eq("session_id", session.id);
  takenColors = new Set((data || []).map((p) => p.color));
  renderColorGrid();
}

function subscribeToTaken() {
  refreshTaken();
  supabase
    .channel(`join-colors-${session.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `session_id=eq.${session.id}` }, refreshTaken)
    .subscribe();
}

function renderColorGrid() {
  const grid = document.getElementById("colorGrid");
  grid.innerHTML = COLORS.map((c) => {
    const taken = takenColors.has(c);
    const sel = selectedColor === c ? "selected" : "";
    return `<div class="color-opt token-${c} ${taken ? "taken" : ""} ${sel}" data-color="${c}">${c}</div>`;
  }).join("");
  grid.querySelectorAll(".color-opt:not(.taken)").forEach((el) => {
    el.addEventListener("click", () => {
      selectedColor = el.dataset.color;
      renderColorGrid();
      document.getElementById("joinBtn").disabled = !(selectedColor && document.getElementById("playerName").value.trim());
    });
  });
}

document.getElementById("playerName").addEventListener("input", () => {
  document.getElementById("joinBtn").disabled = !(selectedColor && document.getElementById("playerName").value.trim());
});

document.getElementById("joinBtn").addEventListener("click", async () => {
  const name = document.getElementById("playerName").value.trim();
  if (!name || !selectedColor) return;

  const { count } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("session_id", session.id);
  const turn_order = count || 0;

  const { data, error } = await supabase
    .from("players")
    .insert({ session_id: session.id, name, color: selectedColor, turn_order, position: 0 })
    .select()
    .single();

  if (error) {
    document.getElementById("joinMsg").textContent =
      error.message.includes("duplicate") ? "That color was just taken — pick another." : error.message;
    await refreshTaken();
    return;
  }

  localStorage.setItem(`wq_player_${session.id}`, data.id);
  window.location.href = `board.html?board=${boardNumber}&session=${session.join_code}`;
});

init();
