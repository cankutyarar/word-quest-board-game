import { supabase } from "./supabaseClient.js";
import { renderTopbar, escapeHtml } from "./main.js";

document.getElementById("topbar").innerHTML = renderTopbar();

let currentBoard = null; // full board row
let middleSpaces = [];   // editable spaces, excludes start/finish

// ---------- Auth ----------
async function refreshAuthUI() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    document.getElementById("loginCard").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    document.getElementById("teacherEmail").textContent = session.user.email;
    await loadSettings();
    await loadBoards();
  } else {
    document.getElementById("loginCard").classList.remove("hidden");
    document.getElementById("dashboard").classList.add("hidden");
  }
}

document.getElementById("signInBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  document.getElementById("loginMsg").textContent = error ? error.message : "";
  if (!error) refreshAuthUI();
});

document.getElementById("signUpBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const { error } = await supabase.auth.signUp({ email, password });
  document.getElementById("loginMsg").textContent = error
    ? error.message
    : "Account created. Check your email if confirmation is required, then sign in.";
});

document.getElementById("signOutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  refreshAuthUI();
});

// ---------- Site settings ----------
async function loadSettings() {
  const { data } = await supabase.from("site_settings").select("*").eq("id", 1).single();
  if (data) {
    document.getElementById("rulesText").value = data.rules_text || "";
    document.getElementById("tokenGuide").value = data.token_guide || "";
    document.getElementById("diceGuide").value = data.dice_guide || "";
  }
}

document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
  const rules_text = document.getElementById("rulesText").value;
  const token_guide = document.getElementById("tokenGuide").value;
  const dice_guide = document.getElementById("diceGuide").value;
  const { error } = await supabase
    .from("site_settings")
    .update({ rules_text, token_guide, dice_guide, updated_at: new Date().toISOString() })
    .eq("id", 1);
  document.getElementById("settingsMsg").textContent = error ? error.message : "Saved ✓";
});

// ---------- Boards ----------
async function loadBoards() {
  const { data: boards } = await supabase.from("boards").select("*").order("board_number");
  const tabs = document.getElementById("boardTabs");
  tabs.innerHTML = (boards || [])
    .map((b) => `<button class="btn btn-outline btn-sm" data-id="${b.id}">${b.name}</button>`)
    .join("");
  tabs.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => openBoard(btn.dataset.id));
  });
  if (boards && boards.length) openBoard(boards[0].id);
}

async function openBoard(boardId) {
  const { data: board } = await supabase.from("boards").select("*").eq("id", boardId).single();
  currentBoard = board;
  document.getElementById("boardEditor").classList.remove("hidden");
  document.getElementById("boardName").value = board.name;
  document.getElementById("boardDice").value = board.dice_type;
  document.getElementById("boardWinRule").value = board.win_rule;

  const { data: spaces } = await supabase
    .from("spaces")
    .select("*")
    .eq("board_id", boardId)
    .order("position");

  const all = spaces || [];
  middleSpaces = all.slice(1, Math.max(all.length - 1, 1)).map((s) => ({
    prompt: s.prompt || "",
    image_url: s.image_url || "",
    is_special: !!s.is_special,
  }));
  renderSpacesEditor();
}

document.getElementById("saveBoardBtn").addEventListener("click", async () => {
  const name = document.getElementById("boardName").value.trim() || "Untitled Board";
  const dice_type = document.getElementById("boardDice").value;
  const win_rule = document.getElementById("boardWinRule").value;
  const { error } = await supabase.from("boards").update({ name, dice_type, win_rule }).eq("id", currentBoard.id);
  document.getElementById("boardMsg").textContent = error ? error.message : "Saved ✓";
  if (!error) await loadBoards();
});

// ---------- Spaces editor ----------
function renderSpacesEditor() {
  const el = document.getElementById("spacesEditor");
  let html = `<div class="space start" style="width:100%;margin-bottom:8px;">START</div>`;
  html += middleSpaces
    .map(
      (s, i) => `
    <div class="card" style="margin:8px 0;" data-idx="${i}">
      <div class="row between">
        <strong>Space ${i + 1}</strong>
        <button class="btn btn-danger btn-sm remove-space" data-idx="${i}">Remove</button>
      </div>
      <div class="field"><label>Prompt / question</label><textarea rows="2" class="space-prompt" data-idx="${i}">${escapeHtml(s.prompt)}</textarea></div>
      <div class="field"><label>Image URL (optional)</label><input type="url" class="space-image" data-idx="${i}" value="${escapeHtml(s.image_url)}" /></div>
      <label><input type="checkbox" class="space-special" data-idx="${i}" ${s.is_special ? "checked" : ""} /> Mark as special space ★</label>
    </div>`
    )
    .join("");
  html += `<div class="space finish" style="width:100%;margin-top:8px;">FINISH</div>`;
  el.innerHTML = html;

  el.querySelectorAll(".remove-space").forEach((btn) =>
    btn.addEventListener("click", () => {
      middleSpaces.splice(Number(btn.dataset.idx), 1);
      renderSpacesEditor();
    })
  );
  el.querySelectorAll(".space-prompt").forEach((t) =>
    t.addEventListener("input", () => (middleSpaces[t.dataset.idx].prompt = t.value))
  );
  el.querySelectorAll(".space-image").forEach((t) =>
    t.addEventListener("input", () => (middleSpaces[t.dataset.idx].image_url = t.value))
  );
  el.querySelectorAll(".space-special").forEach((t) =>
    t.addEventListener("change", () => (middleSpaces[t.dataset.idx].is_special = t.checked))
  );
}

document.getElementById("addSpaceBtn").addEventListener("click", () => {
  middleSpaces.push({ prompt: "", image_url: "", is_special: false });
  renderSpacesEditor();
});

document.getElementById("shuffleBtn").addEventListener("click", () => {
  // Shuffle the CONTENT across the existing space slots (Fisher-Yates),
  // so the same board can be replayed with prompts landing in new spots.
  for (let i = middleSpaces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [middleSpaces[i], middleSpaces[j]] = [middleSpaces[j], middleSpaces[i]];
  }
  renderSpacesEditor();
});

document.getElementById("saveSpacesBtn").addEventListener("click", async () => {
  const boardId = currentBoard.id;
  await supabase.from("spaces").delete().eq("board_id", boardId);

  const rows = [];
  rows.push({ board_id: boardId, position: 0, prompt: "Start", image_url: null, is_special: false });
  middleSpaces.forEach((s, i) => {
    rows.push({
      board_id: boardId,
      position: i + 1,
      prompt: s.prompt,
      image_url: s.image_url || null,
      is_special: s.is_special,
    });
  });
  rows.push({
    board_id: boardId,
    position: middleSpaces.length + 1,
    prompt: "Finish",
    image_url: null,
    is_special: false,
  });

  const { error } = await supabase.from("spaces").insert(rows);
  document.getElementById("spacesMsg").textContent = error ? error.message : "Saved ✓";
});

refreshAuthUI();
