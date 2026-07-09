import { supabase } from "./supabaseClient.js";
import { renderTopbar, COLORS, genJoinCode, qs, TEACHER_EMAIL } from "./main.js";

document.getElementById("topbar").innerHTML = renderTopbar();

const boardNumber = Number(qs("board")) || 1;
let board = null;
let session = null;
let selectedColor = null;
let takenColors = new Set();
let colorChannel = null;

async function init() {
  const { data: b } = await supabase.from("boards").select("*").eq("board_number", boardNumber).single();
  board = b;
  document.getElementById("waitingBoardName").textContent = board ? board.name : `Board ${boardNumber}`;
  document.getElementById("boardNameLabel").textContent = board ? board.name : `Board ${boardNumber}`;

  await findSession();
  watchForSessionStart();
}

async function findSession() {
  const { data } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("board_id", board.id)
    .neq("status", "finished")
    .order("created_at", { ascending: false })
    .limit(1);
  session = (data && data[0]) || null;

  if (session) {
    // Already joined this session on this device? Skip straight back in.
    const savedPlayerId = localStorage.getItem(`wq_player_${session.id}`);
    if (savedPlayerId) {
      const { data: existing } = await supabase.from("players").select("id").eq("id", savedPlayerId).single();
      if (existing) {
        window.location.href = `board.html?board=${boardNumber}&session=${session.join_code}`;
        return;
      }
      localStorage.removeItem(`wq_player_${session.id}`);
    }

    document.getElementById("waitingCard").classList.add("hidden");
    document.getElementById("nameCard").classList.remove("hidden");
    subscribeToTaken();
  } else {
    document.getElementById("waitingCard").classList.remove("hidden");
    document.getElementById("nameCard").classList.add("hidden");
  }
}

function watchForSessionStart() {
  supabase
    .channel(`wait-${board.id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_sessions", filter: `board_id=eq.${board.id}` },
      () => {
        if (!session) findSession();
      }
    )
    .subscribe();
}

async function startBoard(password) {
  const { error: authError } = await supabase.auth.signInWithPassword({ email: TEACHER_EMAIL, password });
  if (authError) return "Incorrect password.";

  const { data, error } = await supabase
    .from("game_sessions")
    .insert({ board_id: board.id, join_code: genJoinCode(), status: "waiting", current_turn_order: 0 })
    .select()
    .single();
  if (error) return error.message;

  session = data;
  document.getElementById("waitingCard").classList.add("hidden");
  document.getElementById("nameCard").classList.remove("hidden");
  subscribeToTaken();
  return null;
}

document.getElementById("teacherStartBtn").addEventListener("click", async () => {
  const pw = document.getElementById("teacherStartPw").value;
  const msg = await startBoard(pw);
  document.getElementById("teacherStartMsg").textContent = msg || "";
});

async function refreshTaken() {
  const { data } = await supabase.from("players").select("color").eq("session_id", session.id).not("color", "is", null);
  takenColors = new Set((data || []).map((p) => p.color));
  renderColorGrid();
}

function subscribeToTaken() {
  refreshTaken();
  if (colorChannel) supabase.removeChannel(colorChannel);
  colorChannel = supabase
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
      updateJoinBtn();
    });
  });
}

function updateJoinBtn() {
  document.getElementById("joinBtn").disabled = !(selectedColor && document.getElementById("playerName").value.trim());
}
document.getElementById("playerName").addEventListener("input", updateJoinBtn);

document.getElementById("joinBtn").addEventListener("click", async () => {
  const name = document.getElementById("playerName").value.trim();
  if (!name || !selectedColor) return;

  const { count } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("session_id", session.id)
    .eq("is_spectator", false);
  const turn_order = count || 0;

  const { data, error } = await supabase
    .from("players")
    .insert({ session_id: session.id, name, color: selectedColor, turn_order, position: 0, is_spectator: false })
    .select()
    .single();

  if (error) {
    document.getElementById("joinMsg").textContent = error.message.includes("duplicate")
      ? "That color was just taken — pick another."
      : error.message;
    await refreshTaken();
    return;
  }

  localStorage.setItem(`wq_player_${session.id}`, data.id);
  window.location.href = `board.html?board=${boardNumber}&session=${session.join_code}`;
});

document.getElementById("teacherJoinBtn").addEventListener("click", async () => {
  const pw = document.getElementById("teacherJoinPw").value;
  const name = document.getElementById("playerName").value.trim() || "Teacher";
  const msg = document.getElementById("joinMsg");

  const { error: authError } = await supabase.auth.signInWithPassword({ email: TEACHER_EMAIL, password: pw });
  if (authError) {
    msg.textContent = "Incorrect password.";
    return;
  }

  const { data, error } = await supabase
    .from("players")
    .insert({ session_id: session.id, name, color: null, turn_order: null, position: null, is_spectator: true })
    .select()
    .single();

  if (error) {
    msg.textContent = error.message;
    return;
  }

  localStorage.setItem(`wq_player_${session.id}`, data.id);
  window.location.href = `board.html?board=${boardNumber}&session=${session.join_code}`;
});

init();
