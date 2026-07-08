export const COLORS = ["red", "blue", "green", "yellow", "purple", "orange"];

// The one teacher account for this deployment. Create it once in the
// Supabase dashboard (Authentication → Users → Add user) with this exact
// email — see README for steps. Students never see a sign-up option.
export const TEACHER_EMAIL = "teacher@wordquest.local";

export function renderTopbar(active) {
  const links = [
    { href: "index.html", label: "Home" },
    { href: "join.html?board=1", label: "Board 1" },
    { href: "join.html?board=2", label: "Board 2" },
    { href: "join.html?board=3", label: "Board 3" },
    { href: "join.html?board=4", label: "Board 4" },
    { href: "teacher.html", label: "Teacher" },
  ];
  const nav = links
    .map((l) => `<a href="${l.href}">${l.label}</a>`)
    .join("");
  return `
    <div class="topbar">
      <a class="brand" href="index.html"><span class="dot"></span>Word Quest</a>
      <div class="nav">${nav}</div>
    </div>`;
}

export function genJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function rollDie(diceType) {
  const max = diceType === "d4" ? 4 : 6;
  return 1 + Math.floor(Math.random() * max);
}

export function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
