import { supabase } from "./supabaseClient.js";
import { renderTopbar, rollDie, qs } from "./main.js";

document.getElementById("topbar").innerHTML = renderTopbar();

const boardNumber = Number(qs("board")) || 1;
const joinCode = qs("session");

let board = null;
let spaces = [];
let session = null;
let players = [];
let myPlayerId = null;

async function init() {
  const { data: b } = await supabase.from("boards").select("*").eq("board_number", boardNumber).single();
  board = b;
  document.getElementById("boardTitleNoSession").textContent = board ? board.name : `Board ${boardNumber}`;
  document.getElementById("goJoinBtn").href = `join.html?board=${boardNumber}`;
  document.getElementById("joinAnotherBtn").href = `join.html?board=${boardNumber}`;

  if (!joinCode) {
    document.getElementById("noSessionCard").classList.remove("hidden");
    return;
  }

  const { data: s } = await supabase.from("game_sessions").select("*").eq("join_code", joinCode.toUpperCase()).single();
  if (!s) {
    document.getElementById("noSessionCard").classList.remove("hidden");
    return;
  }
  session = s;
  myPlayerId = localStorage.getItem(`wq_player_${session.id}`);

  const { data: sp } = await supabase.from("spaces").select("*").eq("board_id", board.id).order("position");
  spaces = sp || [];

  document.getElementById("gameArea").classList.remove("hidden");
  document.getElementById("boardTitle").textContent = board.name;
  document.getElementById("codeShown").textContent = session.join_code;
  document.getElementById("diceLabel").textContent = board.dice_type.toUpperCase();
  document.getElementById("diceLabel").className = `pill pill-${board.dice_type}`;

  await refreshPlayers();
  subscribeRealtime();
}

async function refreshPlayers() {
  const { data } = await supabase.from("players").select("*").eq("session_id", session.id).order("turn_order");
  players = data || [];
  const { data: s } = await supabase.from("game_sessions").select("*").eq("id", session.id).single();
  session = s;
  render();
}

function subscribeRealtime() {
  supabase
    .channel(`board-${session.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `session_id=eq.${session.id}` }, refreshPlayers)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_sessions", filter: `id=eq.${session.id}` }, refreshPlayers)
    .subscribe();
}

function render() {
  renderPath();
  renderPlayerList();
  renderTurnBanner();
}

function renderPath() {
  const finishPos = spaces.length ? spaces[spaces.length - 1].position : 0;
  document.getElementById("pathEl").innerHTML = spaces
    .map((s) => {
      const isStart = s.position === 0;
      const isFinish = s.position === finishPos;
      const cls = isStart ? "space start" : isFinish ? "space finish" : `space${s.is_special ? " special" : ""}`;
      const here = players.filter((p) => p.position === s.position);
      const tokens = here.map((p) => `<div class="token token-${p.color}" title="${p.name}"></div>`).join("");
      const body = isStart || isFinish
        ? `<div>${isStart ? "START" : "FINISH"}</div>`
        : `
          <span class="idx">#${s.position}</span>
          ${s.image_url ? `<img src="${s.image_url}" alt="" />` : ""}
          <div>${s.prompt || ""}</div>`;
      return `<div class="${cls}">${body}<div class="tokens-on-space">${tokens}</div></div>`;
    })
    .join("");
}

function renderPlayerList() {
  document.getElementById("playerList").innerHTML =
    players
      .map(
        (p) => `
      <div class="player-row">
        <div class="token token-${p.color}"></div>
        <div class="name">${p.name}${p.id === myPlayerId ? " (you)" : ""}${p.is_finished ? " 🏁" : ""}</div>
        <div class="pos">pos ${p.position}</div>
      </div>`
      )
      .join("") || `<p class="muted">No players yet.</p>`;
}

function renderTurnBanner() {
  const banner = document.getElementById("turnBanner");
  const rollBtn = document.getElementById("rollBtn");
  const label = document.getElementById("myPlayerLabel");
  const me = players.find((p) => p.id === myPlayerId);

  if (session.status === "finished") {
    banner.textContent = "🎉 Game finished!";
    rollBtn.disabled = true;
    return;
  }
  if (!players.length) {
    banner.textContent = "Waiting for players to join…";
    rollBtn.disabled = true;
    return;
  }

  const current = players.find((p) => p.turn_order === session.current_turn_order);
  banner.textContent = current ? `🎲 ${current.name}'s turn` : "Waiting…";
  label.textContent = me ? `You are ${me.name}` : "You're spectating — join to play.";

  const myTurn = me && current && me.id === current.id && !me.is_finished;
  rollBtn.disabled = !myTurn;
}

document.getElementById("rollBtn").addEventListener("click", async () => {
  const me = players.find((p) => p.id === myPlayerId);
  if (!me) return;
  const diceEl = document.getElementById("diceEl");
  diceEl.classList.add("rolling");
  const roll = rollDie(board.dice_type);
  await new Promise((r) => setTimeout(r, 450));
  diceEl.textContent = roll;
  diceEl.classList.remove("rolling");

  const finishPos = spaces.length ? spaces[spaces.length - 1].position : 0;
  let newPos = me.position;
  let finished = false;

  if (board.win_rule === "exact") {
    const target = me.position + roll;
    if (target <= finishPos) {
      newPos = target;
      finished = target === finishPos;
    } // else: overshoot on exact mode -> stay in place
  } else {
    newPos = Math.min(me.position + roll, finishPos);
    finished = newPos === finishPos;
  }

  await supabase.from("players").update({ position: newPos, is_finished: finished }).eq("id", me.id);

  const { data: freshPlayers } = await supabase.from("players").select("*").eq("session_id", session.id);
  const stillActive = (freshPlayers || []).filter((p) => !p.is_finished);

  if (!stillActive.length) {
    await supabase.from("game_sessions").update({ status: "finished" }).eq("id", session.id);
  } else {
    const sorted = stillActive.sort((a, b) => a.turn_order - b.turn_order);
    let next = sorted.find((p) => p.turn_order > session.current_turn_order);
    if (!next) next = sorted[0];
    await supabase
      .from("game_sessions")
      .update({ status: "playing", current_turn_order: next.turn_order })
      .eq("id", session.id);
  }
});

init();
