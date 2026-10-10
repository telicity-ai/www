// Doodle reactions for the example phrases: a small bubble pops up where the
// pointer touches a phrase. Purely decorative; the page works without it.
(() => {
  const box = document.querySelector(".examples");
  if (!box) return;

  let timer;

  const show = (task, x, y) => {
    const r = box.getBoundingClientRect();
    // 6px offset + 36px bubble + 8px margin must fit inside the viewport.
    const maxX = document.documentElement.clientWidth - 50;
    task.style.setProperty("--rx", `${Math.min(x, maxX) - r.left}px`);
    task.style.setProperty("--ry", `${y - r.top}px`);
    task.classList.add("is-reacting");
  };

  const hide = (task) => task.classList.remove("is-reacting");

  for (const task of box.querySelectorAll(".task")) {
    task.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") show(task, e.clientX, e.clientY);
    });
    task.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") hide(task);
    });
    task.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      for (const t of box.querySelectorAll(".is-reacting")) hide(t);
      clearTimeout(timer);
      show(task, e.clientX, e.clientY);
      timer = setTimeout(() => hide(task), 1400);
    });
  }
})();
